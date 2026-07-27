import { clonePreviewData, applyPartLabelsToPreviewData, clonePreviewShape } from '../utils/dxf-preview-state'

export function createDxfPreviewService(deps: {
  state: Record<string, unknown>
  getCurrentNestingSettings: () => Record<string, unknown>
  renderFiles: () => void
  schedulePersistJobState: () => void
}): {
  preparePreviewData: (params: {
    state: Record<string, unknown>
    fileId: string
    filename: string
  }) => Promise<DxfPreviewData | null>
  applyPreviewToFile: (params: {
    state: Record<string, unknown>
    fileId: string
    shapes: DxfPreviewShape[]
    layers: Array<Record<string, unknown>>
  }) => void
  parseDXFToShapes: (dxf: Record<string, unknown>, raw: string, settingsInput?: unknown) => unknown
  mockDXFData: (filename: string) => unknown
} {
  interface SelectionCandidate {
    source?: string
    priority?: number
    coverage?: CoverageMetrics
    polygonPoints?: Point[]
    area?: number
    subgroupIndex?: number
    subgroupEntityCount?: number
    subgroupSource?: string
    tolerance?: number
    alpha?: number
    [key: string]: unknown
  }

  interface CoverageMetrics {
    score?: number
    entityCoverage?: number
    pointCoverage?: number
    outerCoverage?: number
    areaCoverage?: number
    selfIntersectionCount?: number
    repeatedVertexCount?: number
    unsupportedEntityCount?: number
    unsupportedEntityIds?: string[]
    partialEntityCount?: number
    partialEntityIds?: string[]
    partialEntities?: Array<{
      id?: string
      type?: string
      layer?: string
      samplePointCount?: number
      supportedProbeCount?: number
      insideProbeCount?: number
      outsideProbeCount?: number
      [key: string]: unknown
    }>
    outerMissCount?: number
    outerMissIds?: string[]
    supportedAreaRatio?: number
    compactness?: number
    [key: string]: unknown
  }

  const { getCurrentNestingSettings, renderFiles, schedulePersistJobState } = deps

  const { createLayerResolver, FALLBACK_PALETTE } =
    (window as { NestDxfLayerService?: Record<string, unknown> }).NestDxfLayerService || {}
  const typedCreateLayerResolver = createLayerResolver as (
    layerTable: unknown
  ) => Record<string, unknown>
  const { debugDXF } = ((window as { NestDxfShapeDetectionService?: Record<string, unknown> })
    .NestDxfShapeDetectionService || { debugDXF: () => {} }) as {
    debugDXF: (...args: unknown[]) => void
  }
  const { buildSketchGroups, extractPolygonForEntities } = (
    window as {
      NestDxfFlattenService?: Record<string, unknown>
    }
  ).NestDxfFlattenService || {
    buildSketchGroups: () => [],
    extractPolygonForEntities: () => null
  }
  const typedExtractPolygonForEntities = extractPolygonForEntities as (
    entities: unknown[]
  ) => unknown
  const typedBuildSketchGroups = buildSketchGroups as (entities: unknown[]) => unknown[]
  const { detectShapes: detectStructuredShapes } = (
    window as { NestDxfShapeStructureService?: Record<string, unknown> }
  ).NestDxfShapeStructureService || {
    detectShapes: () => []
  }
  const { detectContour } = (window as any).NestDxfContourDetectionService || {
    detectContour: () => null,
  }
  const { serializeEntityForExport } = (window as any).NestDxfExportMetadataService || {}
  const {
    normalizeSettings,
    SKETCH_CONTOUR_METHODS = [],
  } = (window as any).NestSettings || {}

  function dedupeRenderedItems(
    items: Array<Record<string, unknown> & { svg?: string; layer?: string }>
  ): Array<Record<string, unknown> & { svg?: string; layer?: string }> {
    const seen = new Set<string>()
    return (items || []).filter((item) => {
      if (!item?.svg) return false
      const key = `${item.layer || '0'}::${item.svg}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  function rectPath(width: number, height: number): string {
    return `M0,0 H${svg.f(width)} V${svg.f(height)} H0 Z`
  }

  function rectPolygonFromBBox(bbox: BoundingBox): Point[] {
    return geometry.closePointRing([
      { x: bbox.minX, y: bbox.minY },
      { x: bbox.maxX, y: bbox.minY },
      { x: bbox.maxX, y: bbox.maxY },
      { x: bbox.minX, y: bbox.maxY }
    ])
  }

  function pointsToPathData(polygonPoints: Point[], minX: number, maxY: number): string {
    const pathPoints =
      polygonPoints.length > 1 &&
      polygonPoints[polygonPoints.length - 1]?.x === polygonPoints[0]?.x &&
      polygonPoints[polygonPoints.length - 1]?.y === polygonPoints[0]?.y
        ? polygonPoints.slice(0, -1)
        : polygonPoints
    return pathPoints.length >= 3 ? svg.pathFromPoints(pathPoints, minX, maxY, true) : ''
  }

  function pointsToLocalPreviewCoords(points: Point[], minX: number, maxY: number): Point[] {
    return Array.isArray(points)
      ? points
          .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
          .map((point) => ({
            x: point.x - minX,
            y: maxY - point.y
          }))
      : []
  }

  function normalizeSketchContourMethod(method: unknown): string {
    const normalized = method == null ? 'auto' : String(method)
    return (SKETCH_CONTOUR_METHODS as readonly string[]).includes(normalized) ? normalized : 'auto'
  }

  function isForcedSketchContourMethod(method: unknown): boolean {
    return normalizeSketchContourMethod(method) !== 'auto'
  }

  function isTrustedSelectionCandidate(
    candidate: SelectionCandidate,
    entityCount: number
  ): boolean {
    const coverage = candidate?.coverage
    if (!coverage) return false
    const source = candidate?.source || ''
    if ((coverage.selfIntersectionCount ?? 0) > 0 || (coverage.repeatedVertexCount ?? 0) > 0)
      return false
    const baseMaxUnsupported = Math.max(0, Math.floor((entityCount || 0) * 0.05))
    const isOpenChain = source === 'exact-open-chain'
    const isTinyShape = (entityCount || 0) <= 3

    if (isOpenChain) {
      return (
        (coverage.entityCoverage ?? 0) >= 0.9 &&
        (coverage.pointCoverage ?? 0) >= (isTinyShape ? 0.98 : 0.8) &&
        (coverage.unsupportedEntityCount ?? Infinity) <= Math.max(2, baseMaxUnsupported) &&
        (coverage.outerCoverage ?? 0) >= 0.9 &&
        (coverage.outerMissCount ?? Infinity) === 0 &&
        (coverage.selfIntersectionCount ?? Infinity) === 0 &&
        (coverage.repeatedVertexCount ?? Infinity) === 0
      )
    }

    return (
      (coverage.entityCoverage ?? 0) >= 0.9 &&
      (coverage.pointCoverage ?? 0) >= 0.85 &&
      (coverage.unsupportedEntityCount ?? Infinity) <= baseMaxUnsupported &&
      (coverage.areaCoverage ?? 0) >= 0.1
    )
  }

  function isValidSelectionCandidate(candidate: SelectionCandidate): boolean {
    const coverage = candidate?.coverage
    if (!coverage) return false
    return (coverage.selfIntersectionCount ?? 0) === 0 && (coverage.repeatedVertexCount ?? 0) === 0
  }

  function isUsableSelectionCandidate(candidate: SelectionCandidate): boolean {
    const coverage = candidate?.coverage
    if (!coverage) return false
    return (
      (coverage.entityCoverage ?? 0) >= 0.6 &&
      (coverage.pointCoverage ?? 0) >= 0.6 &&
      (coverage.outerCoverage ?? 0) >= 0.5
    )
  }

  function sortSelectionCandidates(a: SelectionCandidate, b: SelectionCandidate): number {
    const aScore = a?.coverage?.score ?? -Infinity
    const bScore = b?.coverage?.score ?? -Infinity
    if (Math.abs(bScore - aScore) > 0.025) return bScore - aScore
    const aEntity = a.coverage?.entityCoverage ?? -Infinity
    const bEntity = b.coverage?.entityCoverage ?? -Infinity
    if (Math.abs(bEntity - aEntity) > 0.025) return bEntity - aEntity
    const aPoint = a.coverage?.pointCoverage ?? -Infinity
    const bPoint = b.coverage?.pointCoverage ?? -Infinity
    if (Math.abs(bPoint - aPoint) > 0.025) return bPoint - aPoint
    return (b.priority ?? 0) - (a.priority ?? 0)
  }

  function summarizeCoverageMetrics(coverage: CoverageMetrics): unknown {
    if (!coverage) return null
    return {
      entityCoverage: coverage.entityCoverage ?? null,
      pointCoverage: coverage.pointCoverage ?? null,
      areaCoverage: coverage.areaCoverage ?? null,
      outerCoverage: coverage.outerCoverage ?? null,
      outerMissCount: coverage.outerMissCount ?? null,
      outerMissIds: (coverage.outerMissIds || []).slice(0, 8),
      unsupportedEntityCount: coverage.unsupportedEntityCount ?? null,
      unsupportedEntityIds: (coverage.unsupportedEntityIds || []).slice(0, 8),
      partialEntityCount: coverage.partialEntityCount ?? null,
      partialEntityIds: (coverage.partialEntityIds || []).slice(0, 8),
      partialEntities: (coverage.partialEntities || [])
        .slice(0, 5)
        .map((item: Record<string, unknown>) => ({
          id: item.id ?? null,
          type: item.type ?? null,
          layer: item.layer ?? null,
          samplePointCount: item.samplePointCount ?? null,
          supportedProbeCount: item.supportedProbeCount ?? null,
          insideProbeCount: item.insideProbeCount ?? null,
          outsideProbeCount: item.outsideProbeCount ?? null,
          supportRatio: item.supportRatio ?? null,
          outsideSamplePoints: ((item.outsideSamplePoints as unknown[]) || []).slice(0, 3)
        })),
      supportedAreaRatio: coverage.supportedAreaRatio ?? null,
      compactness: coverage.compactness ?? null,
      selfIntersectionCount: coverage.selfIntersectionCount ?? null,
      repeatedVertexCount: coverage.repeatedVertexCount ?? null,
      score: coverage.score ?? null
    }
  }

  function summarizeCandidateCoverageMetrics(coverage: CoverageMetrics): unknown {
    if (!coverage) return null
    return {
      entityCoverage: coverage.entityCoverage ?? null,
      pointCoverage: coverage.pointCoverage ?? null,
      areaCoverage: coverage.areaCoverage ?? null,
      outerCoverage: coverage.outerCoverage ?? null,
      outerMissCount: coverage.outerMissCount ?? null,
      outerMissIds: (coverage.outerMissIds || []).slice(0, 6),
      unsupportedEntityCount: coverage.unsupportedEntityCount ?? null,
      unsupportedEntityIds: (coverage.unsupportedEntityIds || []).slice(0, 6),
      partialEntityCount: coverage.partialEntityCount ?? null,
      partialEntityIds: (coverage.partialEntityIds || []).slice(0, 6),
      supportedAreaRatio: coverage.supportedAreaRatio ?? null,
      compactness: coverage.compactness ?? null,
      selfIntersectionCount: coverage.selfIntersectionCount ?? null,
      repeatedVertexCount: coverage.repeatedVertexCount ?? null,
      score: coverage.score ?? null
    }
  }

  function isSelectableContourCandidate(
    candidate: SelectionCandidate,
    entityCount: number
  ): boolean {
    if (!isValidSelectionCandidate(candidate)) return false
    const candidateRecord = candidate as Record<string, unknown>
    const source = candidateRecord?.source || ''
    if (source === 'structure-envelope') {
      return isTrustedSelectionCandidate(candidate, entityCount)
    }
    return isUsableSelectionCandidate(candidate)
  }

  function buildRankedSelectionCandidate(entry: Record<string, unknown>): unknown {
    const candidate = (entry?.candidate || {}) as Record<string, unknown>
    const source = candidate?.source || null
    const polygonPoints = candidate?.polygonPoints || null
    return {
      source,
      polygonPoints,
      coverage: entry.score,
      priority: 3
    }
  }

  function buildSelectionCandidateSummary(
    candidate: SelectionCandidate,
    _entityCount: number,
    trusted: boolean
  ): unknown {
    return {
      source: candidate.source,
      priority: candidate.priority,
      polygonPointCount: ((candidate.polygonPoints as unknown[]) || []).length || 0,
      coverage: summarizeCoverageMetrics(candidate.coverage || {}),
      highlightEligible: isValidSelectionCandidate(candidate),
      trusted: !!trusted
    }
  }

  function resolveSelectionNestingCandidate(
    nestingPolygon: unknown,
    _entities: DxfEntity[],
    forcedSource = 'auto'
  ): unknown {
    if (!nestingPolygon) return null
    const normalizedForcedSource = normalizeSketchContourMethod(forcedSource)

    const polygon = nestingPolygon as Record<string, unknown>
    const directCandidate: SelectionCandidate | null =
      Array.isArray(polygon.polygonPoints) && (polygon.polygonPoints as unknown[]).length >= 4
        ? ({
            source: polygon.source,
            polygonPoints: polygon.polygonPoints,
            coverage: polygon.coverage,
            priority: 3
          } as SelectionCandidate)
        : null

    const rankedCandidates = Array.isArray(polygon.rankedCandidates)
      ? (polygon.rankedCandidates as Array<Record<string, unknown>>)
          .map((entry: Record<string, unknown>) => buildRankedSelectionCandidate(entry))
          .filter(Boolean)
      : []

    if (normalizedForcedSource !== 'auto') {
      const forcedMatch = [directCandidate, ...rankedCandidates]
        .filter(Boolean)
        .find(
          (candidate): candidate is SelectionCandidate =>
            (candidate as SelectionCandidate).source === normalizedForcedSource ||
            polygon.builderMode === normalizedForcedSource
        )
      return forcedMatch || directCandidate || rankedCandidates[0] || null
    }

    if (directCandidate && isValidSelectionCandidate(directCandidate)) {
      return directCandidate
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rankedCandidates as any[]).find(isValidSelectionCandidate) || directCandidate
  }

  function chooseSelectionPolygon({
    entities,
    structurePolygonPoints,
    envelopePolygonPoints,
    nestingPolygon,
    forcedSource = 'auto'
  }: {
    entities: DxfEntity[]
    structurePolygonPoints: Point[]
    envelopePolygonPoints: Point[]
    nestingPolygon: unknown
    forcedSource?: string
  }): unknown {
    const normalizedForcedSource = normalizeSketchContourMethod(forcedSource)
    const forcedMode = normalizedForcedSource !== 'auto'
    const candidates: SelectionCandidate[] = []
    const entityCount = entities?.length || 0

    const resolvedNestingCandidate = resolveSelectionNestingCandidate(
      nestingPolygon,
      entities,
      normalizedForcedSource
    )
    const candidate = resolvedNestingCandidate as SelectionCandidate | null
    if (candidate?.polygonPoints?.length) {
      candidates.push(candidate)
    }

    if (
      !forcedMode &&
      Array.isArray(structurePolygonPoints) &&
      structurePolygonPoints.length >= 4
    ) {
      candidates.push({
        source: 'structure-polygon',
        polygonPoints: structurePolygonPoints,
        priority: 2
      })
    }

    if (!forcedMode && Array.isArray(envelopePolygonPoints) && envelopePolygonPoints.length >= 4) {
      candidates.push({
        source: 'structure-envelope',
        polygonPoints: envelopePolygonPoints,
        priority: 0
      })
    }

    if (forcedMode) {
      if (candidate?.polygonPoints?.length) {
        return {
          ...candidate,
          candidateSummaries: candidates.map((candidate) =>
            buildSelectionCandidateSummary(
              candidate,
              entityCount,
              candidate === resolvedNestingCandidate
            )
          )
        }
      }

      return {
        source: null,
        polygonPoints: [],
        coverage: null,
        priority: -1,
        candidateSummaries: []
      }
    }

    if (
      resolvedNestingCandidate &&
      isValidSelectionCandidate(resolvedNestingCandidate as SelectionCandidate)
    ) {
      return {
        ...resolvedNestingCandidate,
        candidateSummaries: candidates.map((candidate) =>
          buildSelectionCandidateSummary(
            candidate as SelectionCandidate,
            entityCount,
            candidate === resolvedNestingCandidate ||
              isTrustedSelectionCandidate(candidate, entityCount)
          )
        )
      }
    }

    const selectableCandidates = candidates
      .filter((candidate) => candidate !== resolvedNestingCandidate)
      .filter((candidate) => isSelectableContourCandidate(candidate, entityCount))
    if (selectableCandidates.length) {
      const selected = selectableCandidates[0]
      return {
        ...selected,
        candidateSummaries: candidates.map((candidate) =>
          buildSelectionCandidateSummary(
            candidate,
            entityCount,
            candidate === selected || isTrustedSelectionCandidate(candidate, entityCount)
          )
        )
      }
    }

    const validCandidates = candidates
      .filter(isValidSelectionCandidate)
      .sort(sortSelectionCandidates)
    if (validCandidates.length) {
      const fallback = validCandidates[0]
      return {
        ...fallback,
        candidateSummaries: candidates.map((candidate) =>
          buildSelectionCandidateSummary(
            candidate,
            entityCount,
            candidate === fallback || isTrustedSelectionCandidate(candidate, entityCount)
          )
        )
      }
    }

    return {
      source: null,
      polygonPoints: [],
      coverage: null,
      priority: -1,
      candidateSummaries: candidates.map((candidate) =>
        buildSelectionCandidateSummary(candidate, entityCount, false)
      )
    }
  }
  function summarizeNestingCandidateEntry(entry: Record<string, unknown>): unknown {
    if (!entry) return null
    const candidate = entry.candidate as SelectionCandidate | undefined
    return {
      source: candidate?.source || null,
      subgroupIndex: candidate?.subgroupIndex ?? null,
      subgroupEntityCount: candidate?.subgroupEntityCount ?? null,
      subgroupSource: candidate?.subgroupSource ?? null,
      tolerance: candidate?.tolerance || null,
      alpha: candidate?.alpha || null,
      polygonPointCount: candidate?.polygonPoints?.length || 0,
      bboxCoverage: entry.bboxCoverage ?? null,
      area: entry.area ?? candidate?.area ?? null,
      areaGain: entry.areaGain ?? null,
      enclosesSeed: entry.enclosesSeed ?? null,
      rootDepth: entry.rootDepth ?? null,
      coverage: summarizeCandidateCoverageMetrics(entry.score as CoverageMetrics),
      dominantRootPreservation: entry.dominantRootPreservation || null,
      unionGeometryDominantPenalty: entry.unionGeometryDominantPenalty || null
    }
  }

  function buildRawPreviewShape({
    entities,
    index,
    layerOrder,
    layerColor,
    resolveEntityColor,
    forceBoundingBoxPolygon = false
  }: {
    entities: DxfEntity[]
    index: number
    layerOrder: string[]
    layerColor: (name: string) => string
    resolveEntityColor: (entity: DxfEntity, layerName: string) => string
    forceBoundingBoxPolygon?: boolean
  }): unknown {
    if (!Array.isArray(entities) || !entities.length) return null

    let renderBBox: BoundingBox | null = null
    entities.forEach((entity) => {
      renderBBox = geometry.unionBBox(renderBBox, geometry.entityBBox(entity))
    })
    if (!renderBBox) return null

    const { minX, minY, maxX, maxY } = renderBBox
    const width = maxX - minX
    const height = maxY - minY
    if (width < 0.5 || height < 0.5) return null

    const usedLayers = [...new Set(entities.map((entity) => entity.layer || '0'))]
    const preferredLayer =
      layerOrder.find((name) => usedLayers.includes(name)) || usedLayers[0] || '0'

    const outerBoundaryItems = dedupeRenderedItems(
      entities
        .map((entity) => {
          const layerName = entity.layer || '0'
          const color = resolveEntityColor(entity, layerName)
          const svgStr = svg.entityToSVGStr(entity, minX, maxY, color)
          if (!svgStr) return null
          return { layer: layerName, color, svg: svgStr }
        })
        .filter(Boolean) as Array<Record<string, unknown> & { svg: string; layer: string }>
    )

    const exportEntityMap = new Map()
    entities.forEach((entity) => {
      const key =
        entity.handle ||
        JSON.stringify([
          entity.type,
          entity.layer,
          entity.start?.x,
          entity.start?.y,
          entity.end?.x,
          entity.end?.y,
          entity.center?.x,
          entity.center?.y,
          entity.radius,
          entity.startAngle,
          entity.endAngle,
          entity.vertices?.length
        ])
      if (!exportEntityMap.has(key)) {
        const serialized = typedSerializeEntityForExport(entity, entityToPointsForExport)
        if (serialized) exportEntityMap.set(key, serialized)
      }
    })

    const extractedPolygon = forceBoundingBoxPolygon
      ? null
      : typedExtractPolygonForEntities(entities)
    const polygonPoints = (
      forceBoundingBoxPolygon
        ? rectPolygonFromBBox(renderBBox)
        : (extractedPolygon as Record<string, unknown> | null)?.polygonPoints ||
          rectPolygonFromBBox(renderBBox)
    ) as Point[]
    const polygonPath = forceBoundingBoxPolygon ? '' : pointsToPathData(polygonPoints, minX, maxY)
    const fallbackPath = rectPath(width, height)
    const selectionPath = polygonPath || fallbackPath
    return {
      id: `s_${index}`,
      name: `Sketch ${index + 1}`,
      layer: preferredLayer,
      layerColor: layerColor(preferredLayer),
      hasSyntheticOuter: true,
      hasExtractedPolygon: !forceBoundingBoxPolygon && !!extractedPolygon,
      mixedOuterLayers: usedLayers.length > 1,
      selectionFillAllowed: false,
      selectionPolygonSource: forceBoundingBoxPolygon
        ? 'bbox-forced'
        : extractedPolygon
          ? 'raw-extracted'
          : 'bbox-fallback',
      outerBoundaryItems,
      pathData: polygonPath,
      selectionPathData: selectionPath,
      fillRule: 'nonzero',
      polygonPoints,
      engravingPolygonPoints: pointsToLocalPreviewCoords(polygonPoints, minX, maxY),
      engravingHoles: [],
      bbox: { w: width, h: height },
      decorSVG: [],
      decorItems: [],
      exportEntities: [...exportEntityMap.values()],
      ownerLayers: usedLayers,
      involvedLayers: usedLayers,
      holes: [],
      qty: 1,
      visible: true,
      selected: false
    }
  }

  function entityToPointsForExport(entity: DxfEntity): Point[] {
    if (!entity?.type) return []
    switch (entity.type) {
      case 'LWPOLYLINE':
      case 'POLYLINE':
        return Array.isArray(entity.vertices)
          ? geometry.polylineVerticesToPoints(entity.vertices, entity.closed !== false)
          : []
      case 'CIRCLE':
        return geometry.circleToPoints(entity)
      case 'ELLIPSE':
        return geometry.ellipseToPoints(entity, false)
      case 'SPLINE':
        return geometry.splineToPoints(entity)
      default:
        return []
    }
  }

  function buildStructuredPreviewShape({
    shapeRecord,
    index,
    layerOrder,
    layerColor,
    resolveEntityColor,
    nestingPolygon,
    forcedContourMethod = 'auto'
  }: {
    shapeRecord: Record<string, unknown>
    index: number
    layerOrder: string[]
    layerColor: (name: string) => string
    resolveEntityColor: (entity: DxfEntity, layerName: string) => string
    nestingPolygon: unknown
    forcedContourMethod?: string
  }): unknown {
    const entities = Array.isArray(shapeRecord?.entities) ? shapeRecord.entities : []
    const parentContour = shapeRecord.parentContour as Record<string, unknown> | undefined
    const typedNestingPolygon = nestingPolygon as Record<string, unknown> | undefined
    if (!entities.length) return null

    let renderBBox: BoundingBox | null = (shapeRecord?.bbox as BoundingBox) || null
    entities.forEach((entity) => {
      renderBBox = geometry.unionBBox(renderBBox, geometry.entityBBox(entity))
    })
    if (!renderBBox) return null

    const { minX, minY, maxX, maxY } = renderBBox
    const width = maxX - minX
    const height = maxY - minY
    if (width < 0.5 || height < 0.5) return null

    const usedLayers = [...new Set(entities.map((entity) => entity.layer || '0'))]
    const preferredLayer =
      layerOrder.find((name) => usedLayers.includes(name)) ||
      shapeRecord.layer ||
      usedLayers[0] ||
      '0'

    const outerBoundaryItems = dedupeRenderedItems(
      entities
        .map((entity) => {
          const layerName = entity.layer || '0'
          const color = resolveEntityColor(entity, layerName)
          const svgStr = svg.entityToSVGStr(entity, minX, maxY, color)
          if (!svgStr) return null
          return { layer: layerName, color, svg: svgStr }
        })
        .filter(Boolean) as Array<Record<string, unknown> & { svg: string; layer: string }>
    )

    const exportEntityMap = new Map()
    entities.forEach((entity) => {
      const key =
        entity.handle ||
        JSON.stringify([
          entity.type,
          entity.layer,
          entity.start?.x,
          entity.start?.y,
          entity.end?.x,
          entity.end?.y,
          entity.center?.x,
          entity.center?.y,
          entity.radius,
          entity.startAngle,
          entity.endAngle,
          entity.vertices?.length
        ])
      if (!exportEntityMap.has(key)) {
        const serialized = typedSerializeEntityForExport(entity, entityToPointsForExport)
        if (serialized) exportEntityMap.set(key, serialized)
      }
    })

    const directParentSourcePoints =
      Array.isArray(parentContour?.polygonPoints) &&
      (parentContour.polygonPoints as unknown[]).length >= 4
        ? (parentContour.polygonPoints as Point[])
        : Array.isArray(parentContour?.points) && (parentContour.points as unknown[]).length >= 4
          ? (parentContour.points as Point[])
          : null
    const directParentPolygonPoints =
      Array.isArray(directParentSourcePoints) && directParentSourcePoints.length >= 4
        ? closePointRing(directParentSourcePoints)
        : null
    const directPeerSourcePoints =
      Array.isArray(shapeRecord?.peerOuters) && shapeRecord.peerOuters.length === 1
        ? Array.isArray(shapeRecord.peerOuters[0]?.polygonPoints) &&
          shapeRecord.peerOuters[0].polygonPoints.length >= 4
          ? shapeRecord.peerOuters[0].polygonPoints
          : Array.isArray(shapeRecord.peerOuters[0]?.points) &&
              shapeRecord.peerOuters[0].points.length >= 4
            ? shapeRecord.peerOuters[0].points
            : null
        : null
    const directPeerPolygonPoints =
      Array.isArray(directPeerSourcePoints) && directPeerSourcePoints.length >= 4
        ? closePointRing(directPeerSourcePoints)
        : null
    const polygonPoints =
      Array.isArray(shapeRecord?.polygonPoints) && shapeRecord.polygonPoints.length
        ? shapeRecord.polygonPoints
        : rectPolygonFromBBox(renderBBox)
    const structureOwnsPolygon =
      !!shapeRecord?.parentContour ||
      !!(shapeRecord?.peerOuters && (shapeRecord.peerOuters as unknown[]).length)
    const structurePolygonPoints = structureOwnsPolygon
      ? directParentPolygonPoints || directPeerPolygonPoints || polygonPoints
      : null
    const envelopePolygonPoints =
      Array.isArray(shapeRecord?.envelopePoints) && shapeRecord.envelopePoints.length
        ? shapeRecord.envelopePoints
        : rectPolygonFromBBox(renderBBox)
    const normalizedForcedContourMethod = normalizeSketchContourMethod(forcedContourMethod)
    const forcedMode = isForcedSketchContourMethod(normalizedForcedContourMethod)
    const selectionChoice = chooseSelectionPolygon({
      entities,
      structurePolygonPoints: (structurePolygonPoints ?? []) as Point[],
      envelopePolygonPoints,
      nestingPolygon,
      forcedSource: normalizedForcedContourMethod
    }) as Record<string, unknown> & {
      polygonPoints?: Point[]
      source?: string
      coverage?: Record<string, unknown>
      candidateSummaries?: unknown[]
    }
    const selectionPolygonPoints = selectionChoice.polygonPoints?.length
      ? selectionChoice.polygonPoints
      : null
    const displayPolygonPoints =
      forcedMode && selectionPolygonPoints?.length
        ? selectionPolygonPoints
        : structurePolygonPoints || polygonPoints
    const polygonPath = pointsToPathData(displayPolygonPoints, minX, maxY)
    const selectionPolygonPath = selectionPolygonPoints
      ? pointsToPathData(selectionPolygonPoints, minX, maxY)
      : null
    const fallbackPath = rectPath(width, height)
    const selectionPath = selectionPolygonPath || null

    const holePolygons = (
      ((shapeRecord.childClosedContours as unknown[] | undefined) || []) as any[]
    )
      .map(
        (contour: Record<string, unknown>) =>
          (contour.polygonPoints || contour.points || []) as Point[]
      )
      .filter((points: Point[]) => Array.isArray(points) && points.length >= 3)

    return {
      id: shapeRecord.id || `s_${index}`,
      name: `Sketch ${index + 1}`,
      layer: preferredLayer,
      layerColor: layerColor(preferredLayer),
      hasSyntheticOuter: !shapeRecord?.parentContour,
      hasExtractedPolygon: !!(shapeRecord?.polygonPoints as unknown[] | undefined)?.length,
      mixedOuterLayers: usedLayers.length > 1,
      selectionFillAllowed: false,
      selectionPolygonSource: selectionChoice.source,
      selectionPolygonCoverage: summarizeCoverageMetrics(
        (selectionChoice.coverage ?? {}) as CoverageMetrics
      ),
      selectionPolygonCandidates: selectionChoice.candidateSummaries || [],
      forcedContourMethod: forcedMode ? normalizedForcedContourMethod : null,
      forcedContourApplied: forcedMode ? !!selectionPolygonPoints?.length : false,
      nestingPolygonFailure: typedNestingPolygon?.failedOpenChain || null,
      nestingPolygonBuilderMode: typedNestingPolygon?.builderMode || null,
      nestingPolygonBuilderDebug: typedNestingPolygon?.builderDebug || null,

      nestingPolygonCandidates: (
        ((typedNestingPolygon?.rankedCandidates as unknown[] | undefined) || []) as any[]
      )
        .slice(0, 4)
        .map(summarizeNestingCandidateEntry)
        .filter(Boolean),
      nestingPolygon: typedNestingPolygon || null,
      outerBoundaryItems,
      pathData: polygonPath || fallbackPath,
      selectionPathData: selectionPath,
      fillRule: 'nonzero',
      polygonPoints: displayPolygonPoints,
      selectionPolygonPoints,
      engravingPolygonPoints: pointsToLocalPreviewCoords(displayPolygonPoints, minX, maxY),
      engravingHoles: holePolygons.map((points: Point[]) =>
        pointsToLocalPreviewCoords(points, minX, maxY)
      ),
      bbox: { w: width, h: height },
      decorSVG: [],
      decorItems: [],
      exportEntities: [...exportEntityMap.values()],
      ownerLayers: usedLayers,
      involvedLayers: usedLayers,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      holes: (((shapeRecord.childClosedContours as unknown[] | undefined) || []) as any[]).map(
        (contour: Record<string, unknown>) => ({
          id: contour.id,
          points: contour.polygonPoints || contour.points || []
        })
      ),
      qty: 1,
      visible: true,
      selected: false
    }
  }

  function parseRawEntityMeta(raw: string): Map<string, unknown> {
    if (!raw) return new Map()
    const lines = raw.split(/\r\n|\r|\n/g)
    const meta = new Map()
    let i = 0
    let inEntities = false
    while (i < lines.length - 1) {
      const code = lines[i].trim()
      const value = lines[i + 1]
      if (
        code === '0' &&
        value === 'SECTION' &&
        lines[i + 2]?.trim() === '2' &&
        lines[i + 3] === 'ENTITIES'
      ) {
        inEntities = true
        i += 4
        continue
      }
      if (inEntities && code === '0' && value === 'ENDSEC') break
      if (inEntities && code === '0') {
        const entity: DxfEntity = { type: value.trim() }
        i += 2
        while (i < lines.length - 1) {
          const groupCode = lines[i].trim()
          const groupValue = lines[i + 1]
          if (groupCode === '0') break
          if (groupCode === '5') entity.handle = groupValue.trim()
          if (groupCode === '62') entity.aciColor = parseInt(groupValue, 10)
          if (groupCode === '420') entity.trueColor = parseInt(groupValue, 10)
          if (groupCode === '210') entity.extrusionX = parseFloat(groupValue)
          if (groupCode === '220') entity.extrusionY = parseFloat(groupValue)
          if (groupCode === '230') entity.extrusionZ = parseFloat(groupValue)
          i += 2
        }
        if (entity.handle) meta.set(entity.handle, entity)
        continue
      }
      i += 2
    }
    return meta
  }

  function applyNegativeZExtrusionTransform(entity: DxfEntity): unknown {
    if (!entity) return entity
    const mirrorPoint = (point: Point): Point => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return point
      return { ...point, x: -point.x }
    }
    if (entity.center) entity.center = mirrorPoint(entity.center)
    if (entity.start) entity.start = mirrorPoint(entity.start)
    if (entity.end) entity.end = mirrorPoint(entity.end)
    if (Array.isArray(entity.vertices))
      entity.vertices = entity.vertices.map((vertex: Point) => mirrorPoint(vertex))
    if (Array.isArray(entity.controlPoints))
      entity.controlPoints = entity.controlPoints.map((point: Point) => mirrorPoint(point))
    if (Array.isArray(entity.fitPoints))
      entity.fitPoints = entity.fitPoints.map((point: Point) => mirrorPoint(point))
    if (entity.majorAxisEndPoint && Number.isFinite(entity.majorAxisEndPoint.x)) {
      entity.majorAxisEndPoint = { ...entity.majorAxisEndPoint, x: -entity.majorAxisEndPoint.x }
    }
    if (
      entity.type === 'ARC' &&
      Number.isFinite(entity.startAngle) &&
      Number.isFinite(entity.endAngle)
    ) {
      entity.startAngle = Math.PI - entity.startAngle
      entity.endAngle = Math.PI - entity.endAngle
    }
    return entity
  }

  function enrichEntitiesFromRaw(entities: DxfEntity[], raw: string): DxfEntity[] {
    const rawMeta = parseRawEntityMeta(raw)
    if (!rawMeta.size) return entities
    return entities.map((entity) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info = rawMeta.get(entity.handle) as Record<string, any> | undefined
      if (!info) return entity
      const extrusion = {
        x: Number.isFinite(info.extrusionX) ? info.extrusionX : 0,
        y: Number.isFinite(info.extrusionY) ? info.extrusionY : 0,
        z: Number.isFinite(info.extrusionZ) ? info.extrusionZ : 1
      }
      if (Number.isFinite(info.aciColor)) entity.rawAciColor = info.aciColor
      if (Number.isFinite(info.trueColor)) entity.rawTrueColor = info.trueColor
      entity.extrusion = extrusion
      if (Math.abs(extrusion.x) < 1e-6 && Math.abs(extrusion.y) < 1e-6 && extrusion.z < 0) {
        applyNegativeZExtrusionTransform(entity)
      }
      return entity
    })
  }

  function parseDXFToShapes(
    dxf: Record<string, unknown>,
    raw: string,
    settingsInput: unknown = {}
  ): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = normalizeSettings ? (normalizeSettings as any)(settingsInput) : settingsInput
    const sketchContourMethod = normalizeSketchContourMethod(settings.sketchContourMethod)
    const singleSketchMode = settings?.multiSketchDetection === false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entities = enrichEntitiesFromRaw([...((dxf.entities as any) || [])], raw)
    const layerTable =
      ((dxf.tables as Record<string, unknown>)?.layer as Record<string, unknown>)?.layers || {}
    const layerOrder = Object.keys(layerTable)
    const { layerColor, resolveEntityColor } = typedCreateLayerResolver(layerTable) as {
      layerColor: (name: string) => string
      resolveEntityColor: (entity: unknown, layerName: string) => string
    }
    const renderableEntities = entities.filter((entity) => {
      if (!entity?.type) return false
      if (['HATCH', 'TEXT', 'MTEXT', 'DIMENSION', 'INSERT', 'POINT'].includes(entity.type))
        return false
      return !!geometry.entityBBox(entity) && !!svg.entityToSVGStr(entity, 0, 0, '#fff')
    })
    if (!renderableEntities.length) return null

    const groups = singleSketchMode
      ? [renderableEntities]
      : typedBuildSketchGroups(renderableEntities)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawPreviewShapes = (groups as any[])
      .map((groupEntities: DxfEntity[], index: number) =>
        buildRawPreviewShape({
          entities: groupEntities,
          index,
          layerOrder,
          layerColor,
          resolveEntityColor,
          forceBoundingBoxPolygon: singleSketchMode
        })
      )
      .filter(Boolean)
    if (!rawPreviewShapes.length) return null

    const structuredShapes = singleSketchMode
      ? []
      : typedDetectStructuredShapes(renderableEntities, {
          singleSketch: false
        })
    debugDXF('Sketch contour method', {
      rawSetting: (settingsInput as Record<string, unknown>)?.sketchContourMethod ?? null,
      normalizedSetting: settings.sketchContourMethod,
      methodPassedToDetect: sketchContourMethod,
      shapeCount: structuredShapes.length,
      knownMethods: SKETCH_CONTOUR_METHODS,
      singleSketchMode
    })
    const nestingPolygons = singleSketchMode
      ? []
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (structuredShapes as any[]).map((shape: Record<string, unknown>) =>
          detectContour(shape, {
            contourMethod: sketchContourMethod,
            gapTolerance: 100,
            tolerance: 0.001
          })
        )

    const shapes = structuredShapes.length
      ? (structuredShapes as any[])
          .map((shapeRecord: Record<string, unknown>, index: number) =>
            buildStructuredPreviewShape({
              shapeRecord,
              index,
              layerOrder,
              layerColor,
              resolveEntityColor,
              nestingPolygon: nestingPolygons[index] || null,
              forcedContourMethod: sketchContourMethod
            })
          )
          .filter(Boolean)
      : rawPreviewShapes
    if (!shapes.length) return null

    const usedLayers = [
      ...new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (shapes as any[]).flatMap(
          (shape: Record<string, unknown>) => shape.involvedLayers || [shape.layer]
        )
      )
    ] as string[]
    const layerMap = new Map(usedLayers.map((name) => [name, layerColor(name)]))
    const orderedLayers = layerOrder
      .map((name) => ({ name, color: layerColor(name) }))
      .filter((layer) => layer.name && usedLayers.includes(layer.name))
    const extraLayers = [...layerMap.entries()]
      .filter(([name]) => !layerOrder.includes(name as string))
      .map(([name, color]) => ({ name: name as string, color }))
    const layers = [...orderedLayers, ...extraLayers]

    return { shapes, layers }
  }

  const LAYER_DEFS = [
    { name: 'BODY', color: '#4f8ef7' },
    { name: 'CUT', color: '#f75f5f' },
    { name: 'DRILL', color: '#4fcf8e' },
    { name: 'FOLD', color: '#f7c34f' },
    { name: 'ENGRAVE', color: '#cf4ff7' }
  ]
  const GENERATORS = [
    (r: () => number) => {
      const w = 50 + r() * 110
      const h = 32 + r() * 80
      return { d: `M0,0 H${svg.f(w)} V${svg.f(h)} H0 Z`, w, h, name: 'Plate' }
    },
    (r: () => number) => {
      const w = 72 + r() * 65
      const h = 62 + r() * 55
      const fw = 18 + r() * 20
      const fh = 18 + r() * 20
      return {
        d: `M0,0 H${svg.f(w)} V${svg.f(fh)} H${svg.f(fw)} V${svg.f(h)} H0 Z`,
        w,
        h,
        name: 'L-Bracket'
      }
    },
    (r: () => number) => {
      const w = 82 + r() * 62
      const h = 52 + r() * 45
      const tw = 14 + r() * 12
      const fw = 14 + r() * 12
      return {
        d: `M0,0 H${svg.f(w)} V${svg.f(h)} H${svg.f(w - fw)} V${svg.f(tw)} H${svg.f(fw)} V${svg.f(h)} H0 Z`,
        w,
        h,
        name: 'U-Channel'
      }
    }
  ]

  function mockDXFData(filename: string): unknown {
    const rng = svg.mkRng(svg.hashStr(filename))
    const numLayers = 2 + Math.floor(rng() * 3)
    const layers = LAYER_DEFS.slice(0, numLayers)
    const shapes: DxfPreviewShape[] = []
    let idx = 0
    layers.forEach((layer) => {
      if (['DRILL', 'FOLD', 'ENGRAVE'].includes(layer.name)) return
      const count = 1 + Math.floor(rng() * 3)
      for (let i = 0; i < count; i++) {
        const generated = GENERATORS[Math.floor(rng() * GENERATORS.length)](rng)
        shapes.push({
          id: `s_${idx++}`,
          name: generated.name + (count > 1 ? ` ${String.fromCharCode(65 + i)}` : ''),
          layer: layer.name,
          layerColor: layer.color,
          pathData: generated.d,
          fillRule: ((generated as Record<string, unknown>).fillRule || 'nonzero') as string,
          bbox: { x: 0, y: 0, w: generated.w, h: generated.h },
          decorSVG: [],
          holes: [],
          qty: 1,
          visible: true,
          selected: false
        })
      }
    })
    return { shapes, layers }
  }

  function engravingLayerIndex(settings: unknown = getCurrentNestingSettings()): number | null {
    const raw = (settings as Record<string, unknown>)?.engravingLayer
    if (raw === 'off' || raw === false || raw == null || raw === '') return null
    const parsed = Number.parseInt(String(raw), 10)
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 2
  }

  function batchLayerTemplateAtIndex(
    state: Record<string, unknown>,
    targetIndex: number,
    excludeFileId: string | null = null
  ): unknown {
    if (!Number.isFinite(targetIndex) || targetIndex < 1) return null
    for (const file of ((state as Record<string, unknown>)?.files as unknown[]) || []) {
      const f = file as Record<string, unknown>
      if (excludeFileId && f?.id === excludeFileId) continue
      const layer = Array.isArray(f?.layers) ? f.layers[targetIndex - 1] : null
      if (layer?.name || layer?.color) return { ...layer }
    }
    return null
  }

  function synthesizeEngravingLayerSequence(
    layers: Array<Record<string, unknown>>,
    state: Record<string, unknown>,
    fileId: string,
    settings: unknown
  ): Array<Record<string, unknown>> {
    const targetIndex = engravingLayerIndex(settings)
    const sourceLayers = Array.isArray(layers) ? layers.map((layer) => ({ ...layer })) : []
    if (targetIndex === null) return sourceLayers
    if (sourceLayers[targetIndex - 1]?.name) return sourceLayers
    const batchTemplate = batchLayerTemplateAtIndex(state, targetIndex, fileId)
    const fallbackColor = (FALLBACK_PALETTE as unknown[] | undefined)?.length
      ? (FALLBACK_PALETTE as unknown[])[(targetIndex - 1) % (FALLBACK_PALETTE as unknown[]).length]
      : '#4488FF'
    sourceLayers[targetIndex - 1] = {
      name: (batchTemplate as Record<string, unknown>)?.name || `Layer ${targetIndex}`,
      color:
        (batchTemplate as Record<string, unknown>)?.color ||
        sourceLayers[targetIndex - 1]?.color ||
        fallbackColor
    }
    return sourceLayers.filter(Boolean)
  }

  async function preparePreviewData({
    state,
    fileId,
    filename
  }: {
    state: Record<string, unknown>
    fileId: string
    filename: string
  }): Promise<DxfPreviewData | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const file = (state.files as any[])?.find(
      (entry: Record<string, unknown>) => entry.id === fileId
    ) as Record<string, unknown> | undefined
    const settings = getCurrentNestingSettings()
    const sketchContourMethod = normalizeSketchContourMethod(settings.sketchContourMethod)
    const matchesSketchMode = file?._multiSketchDetection === !!settings.multiSketchDetection
    const matchesContourMethod =
      normalizeSketchContourMethod(file?._sketchContourMethod) === sketchContourMethod
    let data = null
    let source = 'mock'

    if (
      matchesSketchMode &&
      matchesContourMethod &&
      (file?.shapes as unknown[] | undefined)?.length
    ) {
      data = applyPartLabelsToPreviewData(
        clonePreviewData({
          shapes: file.shapes,
          layers: synthesizeEngravingLayerSequence(
            (file.layers as Record<string, unknown>[]) || [],
            state,
            fileId,
            settings
          )
        }),
        filename
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any
      synthesizeEngravingLayerSequence(
        (file.layers as Record<string, unknown>[]) || [],
        state,
        fileId,
        settings
      )
    }

    if (!data && file && file.path && (window.api as Record<string, unknown>)?.parseDXF) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (window.api as any).parseDXF(file.path, file.bookmark || null)
        if (result.success && result.data) {
          const parsed = parseDXFToShapes(result.data, result.raw, settings)
          if (parsed) {
            const enriched = {
              ...parsed,
              layers: synthesizeEngravingLayerSequence(
                ((parsed as Record<string, unknown>).layers as Record<string, unknown>[]) || [],
                state,
                fileId,
                settings
              )
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data = applyPartLabelsToPreviewData(clonePreviewData(enriched), filename) as any
            if (data) {
              const cloned = clonePreviewData(data)
              if (cloned) {
                file.shapes = cloned.shapes
                file.layers = cloned.layers
              }
            }
            file._multiSketchDetection = !!settings.multiSketchDetection
            file._sketchContourMethod = sketchContourMethod
            source = 'real'
          }
        }
      } catch (error) {
        console.error('[DXF] Unexpected error:', error)
      }
    }

    if (!data)
      data = applyPartLabelsToPreviewData(
        clonePreviewData(mockDXFData(filename) as Record<string, unknown> | null),
        filename
      ) as any // eslint-disable-line @typescript-eslint/no-explicit-any
    return { data, source, file } as unknown as DxfPreviewData
  }

  function applyPreviewToFile({
    state,
    fileId,
    shapes,
    layers
  }: {
    state: Record<string, unknown>
    fileId: string
    shapes: DxfPreviewShape[]
    layers: Array<Record<string, unknown>>
  }): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const file = (state.files as any[])?.find(
      (entry: Record<string, unknown>) => entry.id === fileId
    ) as Record<string, unknown> | undefined
    if (!file) return
    file.shapes = shapes.map((shape) => clonePreviewShape(shape))
    file.layers = layers.map((layer) => ({ ...layer }))
    const settings = getCurrentNestingSettings()
    file._multiSketchDetection = !!settings.multiSketchDetection
    file._sketchContourMethod = normalizeSketchContourMethod(settings.sketchContourMethod)
    file.qty = (file.shapes as DxfPreviewShape[])
      .filter((shape: DxfPreviewShape) => shape.visible !== false)
      .reduce(
        (acc: number, shape: DxfPreviewShape) =>
          acc + Math.max(1, parseInt(String(shape.qty || 1), 10)),
        0
      )
    renderFiles()
    schedulePersistJobState()
  }

  return {
    preparePreviewData,
    applyPreviewToFile,
    parseDXFToShapes,
    mockDXFData
  }
}

// Standalone export for direct import in renderer.ts
export function parseDXFToShapes(dxf: unknown, raw: string, settingsInput: unknown = {}): unknown {
  const service = createDxfPreviewService({
    state: { files: [] },
    getCurrentNestingSettings: () => settingsInput as Record<string, unknown>,
    renderFiles: () => {},
    schedulePersistJobState: () => {}
  })
  return service.parseDXFToShapes(dxf as Record<string, unknown>, raw, settingsInput)
}
