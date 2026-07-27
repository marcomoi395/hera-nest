import type { DxfEntity } from '../../types/dxf-types'
import type { BoundingBox } from '../../types/geometry-types'
import type { Point } from '../../types/geometry-types'
import {
  EPS,
  TWO_PI,
  LOOP_TOLERANCE,
  bboxFromPoints,
  bboxContainsPoint,
  circleToPoints,
  closePointRing,
  dedupePoints,
  ellipseToPoints,
  entityBBox,
  getArcEndpoints,
  getLineEndpoints,
  pointInPoly,
  polygonSignedArea,
  polylineVerticesToPoints,
  samePoint,
  safeSamplePoint,
  splineToPoints
} from '../utils/dxf-geometry'

// Internal type definitions
interface Contour {
  id: string
  type: string
  entity: DxfEntity
  layer: string
  bbox: BoundingBox
  points: Point[]
  sample: Point
  area: number
  parentId?: string
}

interface LineLoopEdge {
  entity: DxfEntity
  reversed: boolean
}

interface GeometryService {
  [key: string]: unknown
}

interface SvgService {
  f?: (n: number) => string
  pathFromPoints?: (points: Point[], ox: number, originMaxY: number, closed: boolean) => string
  [key: string]: unknown
}

export const DXF_DEBUG = true
const DXF_DEBUG_STORE_KEY = '__NEST_DXF_DEBUG__'

export function debugDXF(label: string, payload: unknown): void {
  if (!DXF_DEBUG) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = ensureDebugStore() as any
  store?.events.push({ at: new Date().toISOString(), label, payload })
  console.log(`[DXF DEBUG] ${label}`, payload)
}

function ensureDebugStore(): unknown {
  const global = window as unknown as Record<string, unknown>
  if (!global[DXF_DEBUG_STORE_KEY]) {
    global[DXF_DEBUG_STORE_KEY] = {
      events: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reset(this: any) {
        this.events.length = 0
        return this
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toJSON(this: any) {
        return {
          capturedAt: new Date().toISOString(),
          count: this.events.length,
          events: this.events
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stringify(this: any, pretty = false) {
        return JSON.stringify(this.toJSON(), null, pretty ? 2 : 0)
      }
    }
  }
  return global[DXF_DEBUG_STORE_KEY]
}

function isClosedArc(entity: unknown): boolean {
  if (!entity || typeof entity !== 'object') return false
  const e = entity as Record<string, unknown>
  if (e.type !== 'ARC' || !e.center || typeof e.radius !== 'number' || !Number.isFinite(e.radius))
    return false
  let span =
    typeof e.angleLength === 'number' && Number.isFinite(e.angleLength)
      ? Math.abs(e.angleLength)
      : Math.abs((Number(e.endAngle) || 0) - (Number(e.startAngle) || 0))
  while (span > TWO_PI) span -= TWO_PI
  if (span <= 0) span += TWO_PI
  if (span >= TWO_PI - 1e-3) return true
  const endpoints = getArcEndpoints(entity)
  return !!endpoints && samePoint(endpoints.start, endpoints.end, LOOP_TOLERANCE * 4)
}

export function isClosedEntity(entity: unknown): boolean {
  if (!entity || typeof entity !== 'object') return false
  const e = entity as Record<string, unknown>
  if (!e.type) return false
  if (
    (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') &&
    Array.isArray(e.vertices) &&
    e.vertices.length >= 3
  ) {
    return e.closed !== false
  }
  if (e.type === 'CIRCLE') return true
  if (isClosedArc(entity)) return true
  if (e.type === 'ELLIPSE') {
    const start = e.startParameter ?? e.startAngle ?? 0
    const end = e.endParameter ?? e.endAngle ?? TWO_PI
    return (
      Math.abs(Math.abs(Number(end) - Number(start)) - TWO_PI) < 1e-4 ||
      Math.abs((Number(end) - Number(start)) % TWO_PI) < 1e-4
    )
  }
  if (e.type === 'SPLINE')
    return (
      !!e.closed &&
      ((Array.isArray(e.fitPoints) && e.fitPoints.length > 2) ||
        (Array.isArray(e.controlPoints) && e.controlPoints.length > 2))
    )
  return false
}

function sampleArcPoints(entity: unknown, maxStepDeg = 6): Point[] {
  if (!entity || typeof entity !== 'object') return []
  const e = entity as Record<string, unknown>
  const endpoints = getArcEndpoints(entity)
  if (!e.center || typeof e.radius !== 'number' || !Number.isFinite(e.radius) || !endpoints)
    return []
  const start = typeof e.startAngle === 'number' && Number.isFinite(e.startAngle) ? e.startAngle : 0
  let end = typeof e.endAngle === 'number' && Number.isFinite(e.endAngle) ? e.endAngle : start
  while (end <= start) end += TWO_PI
  const span = end - start
  const step = Math.max((maxStepDeg * Math.PI) / 180, Math.PI / 90)
  const steps = Math.max(8, Math.ceil(Math.abs(span) / step))
  const points: Point[] = []
  const center = e.center as { x: number; y: number }
  for (let i = 0; i <= steps; i++) {
    const angle = start + span * (i / steps)
    points.push({
      x: center.x + e.radius * Math.cos(angle),
      y: center.y + e.radius * Math.sin(angle)
    })
  }
  points[0] = endpoints.start
  points[points.length - 1] = endpoints.end
  return points
}

export function contourEntityToPoints(ent: unknown): Point[] {
  if (!ent || typeof ent !== 'object') return []
  const e = ent as Record<string, unknown>
  if (!e.type) return []
  switch (e.type) {
    case 'LINE_LOOP':
      return dedupePoints(Array.isArray(e.points) ? e.points : [], true)
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return Array.isArray(e.vertices) ? polylineVerticesToPoints(e.vertices, true) : []
    case 'CIRCLE':
      return circleToPoints(ent)
    case 'ARC':
      return isClosedArc(ent)
        ? circleToPoints({ center: e.center, radius: e.radius })
        : sampleArcPoints(ent)
    case 'ELLIPSE':
      return ellipseToPoints(ent, true)
    case 'SPLINE':
      return splineToPoints(ent)
    default:
      return []
  }
}

export function contourEntityToPath(ent: unknown, ox = 0, originMaxY = 0): string {
  const svg = (window as unknown as Record<string, unknown>).NestDxfSvg as SvgService | undefined
  if (ent && typeof ent === 'object') {
    const e = ent as Record<string, unknown>
    if (e.type === 'LINE_LOOP' && Array.isArray(e.orderedEdges) && e.orderedEdges.length) {
      return lineLoopToSVGPath(e.orderedEdges, ox, originMaxY)
    }
  }
  const points = contourEntityToPoints(ent)
  return typeof svg?.pathFromPoints === 'function'
    ? svg.pathFromPoints(points, ox, originMaxY, true)
    : ''
}

export function lineLoopToSVGPath(
  orderedEdges: LineLoopEdge[],
  ox: number,
  originMaxY: number
): string {
  const svg = (window as unknown as Record<string, unknown>).NestDxfSvg as SvgService | undefined
  if (!Array.isArray(orderedEdges) || !orderedEdges.length || typeof svg?.f !== 'function')
    return ''
  const edgeStartPoint = (entity: DxfEntity, reversed: boolean): Point | null => {
    const e = entity as unknown as Record<string, unknown>
    if (entity.type === 'LINE') {
      const endpoints = getLineEndpoints(entity)
      return endpoints ? (reversed ? endpoints.end : endpoints.start) : null
    }
    if (entity.type === 'ARC' && e.center && typeof e.radius === 'number') {
      const angle = reversed ? (e.endAngle as number) || 0 : (e.startAngle as number) || 0
      return {
        x: (e.center as Point).x + e.radius * Math.cos(angle),
        y: (e.center as Point).y + e.radius * Math.sin(angle)
      }
    }
    if (entity.type === 'SPLINE') {
      const pts = splineToPoints(entity)
      if (!pts.length) return null
      return reversed ? pts[pts.length - 1] : pts[0]
    }
    return null
  }

  const first = orderedEdges[0]
  const p0 = edgeStartPoint(first.entity, first.reversed)
  if (!p0 || !svg?.f) return ''
  let d = `M${svg.f(p0.x - ox)},${svg.f(originMaxY - p0.y)}`

  orderedEdges.forEach(({ entity, reversed }) => {
    const e = entity as unknown as Record<string, unknown>
    if (entity.type === 'LINE') {
      const endpoints = getLineEndpoints(entity)
      const end = reversed ? endpoints?.start : endpoints?.end
      if (end && svg?.f) d += ` L${svg.f(end.x - ox)},${svg.f(originMaxY - end.y)}`
    } else if (entity.type === 'ARC' && e.center && typeof e.radius === 'number') {
      const center = e.center as Point
      const cx = center.x - ox
      const cy = originMaxY - center.y
      const r = e.radius
      const endAngle = reversed ? (e.startAngle as number) || 0 : (e.endAngle as number) || 0
      let span = Number.isFinite(e.angleLength)
        ? (e.angleLength as number)
        : (e.endAngle as number) - (e.startAngle as number)
      if (span <= 0) span += TWO_PI
      if (span >= TWO_PI - 1e-4) span = TWO_PI - 1e-4
      const x2 = cx + r * Math.cos(endAngle)
      const y2 = cy - r * Math.sin(endAngle)
      const large = span > Math.PI ? 1 : 0
      const sweep = reversed ? 1 : 0
      if (svg?.f) d += ` A${svg.f(r)},${svg.f(r)},0,${large},${sweep},${svg.f(x2)},${svg.f(y2)}`
    } else if (entity.type === 'SPLINE') {
      const pts = splineToPoints(entity)
      const segPts = reversed ? [...pts].reverse() : pts
      segPts.slice(1).forEach((pt: Point) => {
        if (svg?.f) d += ` L${svg.f(pt.x - ox)},${svg.f(originMaxY - pt.y)}`
      })
    }
  })

  return `${d} Z`
}

export function contourContainsContour(parent: Contour, child: Contour): boolean {
  if (!parent?.bbox || !child?.sample) return false
  if (!bboxContainsPoint(parent.bbox, child.sample)) return false
  return pointInPoly(child.sample.x, child.sample.y, parent.points || [])
}

export function contourDepth(contour: Contour, contourById: Map<string, Contour>): number {
  let depth = 0
  let current = contour
  while (current?.parentId) {
    depth += 1
    current = contourById.get(current.parentId) as Contour
    if (!current) break
  }
  return depth
}

export function contourPreferenceScore(contour: Contour): number[] {
  const entity = contour?.entity || ({} as Record<string, unknown>)
  const e = entity as unknown as Record<string, unknown>
  return [
    entity.type === 'LINE_LOOP' ? 0 : 1,
    e.isPrimary ? 1 : 0,
    e.isSingleLayer ? 1 : 0,
    contour.area || 0
  ]
}

export function compareContourPreference(a: Contour, b: Contour): number {
  const aa = contourPreferenceScore(a)
  const bb = contourPreferenceScore(b)
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== bb[i]) return aa[i] - bb[i]
  }
  return 0
}

export function groupByContour(contours: Contour[]): Array<{ contour: Contour; depth: number }> {
  const contourById = new Map((contours || []).map((contour) => [contour.id, contour]))
  return (contours || []).map((contour) => ({
    contour,
    depth: contourDepth(contour, contourById)
  }))
}

function collectPointCloud(entities: DxfEntity[]): Point[] {
  const points: Point[] = []
  ;(entities || []).forEach((entity) => {
    const entityPoints = contourEntityToPoints(entity)
    if (entityPoints.length) points.push(...entityPoints)
    const probe = safeSamplePoint(entity)
    if (probe) points.push(probe)
  })
  return points
}

export function sampleEntityPoints(entity: DxfEntity): Point[] {
  return contourEntityToPoints(entity)
}

export function computeConvexHull(points: Point[]): Point[] {
  const unique: Point[] = []
  const seen = new Set<string>()
  ;(points || []).forEach((point) => {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return
    const key = `${point.x.toFixed(6)},${point.y.toFixed(6)}`
    if (seen.has(key)) return
    seen.add(key)
    unique.push({ x: point.x, y: point.y })
  })
  if (unique.length < 3) return closePointRing(unique)

  unique.sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Point, a: Point, b: Point): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  unique.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0)
      lower.pop()
    lower.push(point)
  })
  const upper: Point[] = []
  for (let i = unique.length - 1; i >= 0; i--) {
    const point = unique[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0)
      upper.pop()
    upper.push(point)
  }
  upper.pop()
  lower.pop()
  const hull = lower.concat(upper)
  if (hull.length < 3) return closePointRing(unique.slice(0, 3))
  if (polygonSignedArea(hull) < 0) hull.reverse()
  return closePointRing(hull)
}

export function circumradius(a: Point, b: Point, c: Point): number {
  const ab = Math.hypot(b.x - a.x, b.y - a.y)
  const bc = Math.hypot(c.x - b.x, c.y - b.y)
  const ca = Math.hypot(a.x - c.x, a.y - c.y)
  const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  if (area2 <= EPS) return Infinity
  return (ab * bc * ca) / area2 / 2
}

export function bowyerWatson(_points: Point[]): unknown[] {
  void _points
  return []
}

export function estimateAlpha(points: Point[]): number {
  const bbox = bboxFromPoints(points || [])
  if (!bbox) return 1
  return Math.max(EPS, Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) / 12)
}

export function computeAlphaShape(points: Point[]): Point[] {
  return computeConvexHull(points)
}

export function buildAlphaShapeContours(entities: DxfEntity[]): Contour[] {
  const points = collectPointCloud(entities)
  const hull = computeAlphaShape(points)
  if (hull.length < 4) return []
  const bbox = bboxFromPoints(hull)
  return [
    {
      id: 'alpha_0',
      type: 'LINE_LOOP',
      entity: { type: 'LINE_LOOP', isPrimary: true, isSingleLayer: true } as unknown as DxfEntity,
      layer: '0',
      points: hull,
      bbox: bbox!,
      sample:
        safeSamplePoint({ type: 'LINE_LOOP', vertices: hull } as unknown as DxfEntity) || hull[0],
      area: Math.abs(polygonSignedArea(hull))
    }
  ]
}

export function buildClosedContoursFromLines(entities: DxfEntity[]): Contour[] {
  const contours = (entities || [])
    .filter(isClosedEntity)
    .map((entity, index) => {
      const e = entity as unknown as Record<string, unknown>
      const points = closePointRing(contourEntityToPoints(entity))
      const bbox = entityBBox(entity)
      if (!bbox || points.length < 4) return null
      return {
        id: (e.handle as string) || `cc_${index}`,
        type: entity.type || 'LINE_LOOP',
        entity,
        layer: entity.layer || '0',
        bbox,
        points,
        sample: safeSamplePoint(entity) || points[0],
        area: Math.abs(polygonSignedArea(points.slice(0, -1)))
      }
    })
    .filter(Boolean) as Contour[]

  if (contours.length) return contours

  const hull = computeConvexHull(collectPointCloud(entities))
  if (hull.length < 4) return []
  return [
    {
      id: 'hull_0',
      type: 'LINE_LOOP',
      entity: { type: 'LINE_LOOP', isPrimary: true, isSingleLayer: true } as unknown as DxfEntity,
      layer: (entities || [])[0]?.layer || '0',
      bbox: bboxFromPoints(hull)!,
      points: hull,
      sample: hull[0],
      area: Math.abs(polygonSignedArea(hull.slice(0, -1)))
    }
  ]
}

export function createDxfShapeDetectionService(deps: {
  geometry: GeometryService
  svg: SvgService
  concaveman?: unknown
}): {
  DXF_DEBUG: boolean
  debugDXF: (phase: string, data: unknown) => void
  isClosedEntity: (entity: unknown) => boolean
  contourEntityToPoints: (entity: unknown) => Point[]
  contourEntityToPath: (entity: unknown, ox?: number, originMaxY?: number) => string
  buildClosedContoursFromLines: (entities: DxfEntity[]) => Contour[]
  contourContainsContour: (outer: Contour, inner: Contour) => boolean
  contourDepth: (contour: Contour, contourById: Map<string, Contour>) => number
  contourPreferenceScore: (contour: Contour) => number[]
  compareContourPreference: (a: Contour, b: Contour) => number
  groupByContour: (contours: Contour[]) => Array<{ contour: Contour; depth: number }>
  lineLoopToSVGPath: (orderedEdges: LineLoopEdge[], ox: number, originMaxY: number) => string
  sampleEntityPoints: (entity: DxfEntity) => Point[]
  computeConvexHull: (points: Point[]) => Point[]
  circumradius: (a: Point, b: Point, c: Point) => number
  bowyerWatson: (points: Point[]) => unknown[]
  estimateAlpha: (points: Point[]) => number
  computeAlphaShape: (points: Point[]) => Point[]
  buildAlphaShapeContours: (entities: DxfEntity[]) => Contour[]
} {
  const geometry =
    deps.geometry ||
    ((window as unknown as Record<string, unknown>).NestDxfGeometry as GeometryService)
  const svg = deps.svg || ((window as unknown as Record<string, unknown>).NestDxfSvg as SvgService)

  const empty = {
    DXF_DEBUG,
    debugDXF,
    isClosedEntity,
    contourEntityToPoints,
    contourEntityToPath,
    buildClosedContoursFromLines: () => [],
    contourContainsContour,
    contourDepth,
    contourPreferenceScore,
    compareContourPreference,
    groupByContour,
    lineLoopToSVGPath,
    sampleEntityPoints: () => [],
    computeConvexHull: () => [],
    circumradius: () => Infinity,
    bowyerWatson: () => [],
    estimateAlpha: () => 0,
    computeAlphaShape: () => [],
    buildAlphaShapeContours: () => []
  }

  if (!geometry || !svg) return empty

  return {
    DXF_DEBUG,
    debugDXF,
    isClosedEntity,
    contourEntityToPoints,
    contourEntityToPath,
    buildClosedContoursFromLines,
    contourContainsContour,
    contourDepth,
    contourPreferenceScore,
    compareContourPreference,
    groupByContour,
    lineLoopToSVGPath,
    sampleEntityPoints,
    computeConvexHull,
    circumradius,
    bowyerWatson,
    estimateAlpha,
    computeAlphaShape,
    buildAlphaShapeContours
  }
}
