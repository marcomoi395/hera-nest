import type {
  Point,
  DxfEntityType,
  SplineEntity,
  DxfLayer,
  DxfShape,
  DxfFile,
  DxfHole,
  NestSheet
} from '../../types/dxf-types'
import type { SettingsObject } from '../../types/settings'
import type { AppState } from '../state/store'

interface DxfServiceDeps {
  state: AppState
  getCurrentNestingSettings: () => SettingsObject
}

interface ShapeGeometry {
  origin: Point
  outer: Point[]
  holes: Point[][]
}

interface PlacementItem {
  id: number
  demand: number
  dxf: string
  allowed_orientations: number[]
  shape: {
    type: string
    data: [number, number][]
  }
}

interface PlacementSheet {
  id: string
  width: number | null
  height: number
  width_mode: string
  quantity: string
  material: string
}
export interface ExportItem {
  source_file: string
  source_name: string
  source_shape_id: string
  part_label: string
  layers: DxfLayer[]
  entities: DxfEntityType[]
  polygon: [number, number][]
  holes: [number, number][][]
}

interface PlacementPayload {
  name: string
  settings: SettingsObject
  items: PlacementItem[]
  sheets: PlacementSheet[]
  strip_height: number
}

interface ExportResult {
  payload: PlacementPayload
  path: string
  directory?: string
}

import { FALLBACK_PALETTE } from './dxf-layer-service'
import {
  buildAllowedOrientations,
  sanitizePolygonPoints,
  clonePlain,
  effectiveFileQty,
  partLabelFromName,
  buildJobName,
  roundCoord,
  sameExportPoint
} from '../helpers'

export interface DxfServiceApi {
  ensureFileShapes: (file: DxfFile) => Promise<DxfShape[]>
  hydrateFileShapesForList: (file: DxfFile, cb: () => void) => void
  buildPlacementPayload: () => Promise<PlacementPayload>
  exportPlacementJSON: () => Promise<ExportResult>
}

export function createDxfService({
  state,
  getCurrentNestingSettings
}: DxfServiceDeps): DxfServiceApi {
  function engravingLayerIndex(
    settings: SettingsObject = getCurrentNestingSettings()
  ): number | null {
    const raw = settings?.engravingLayer
    if (raw === 'off' || String(raw) === 'false' || raw == null || raw === '') return null
    const parsed = Number.parseInt(String(raw), 10)
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 2
  }

  function batchLayerTemplateAtIndex(
    targetIndex: number,
    excludeFileId: string | null = null
  ): DxfLayer | null {
    if (!Number.isFinite(targetIndex) || targetIndex < 1) return null
    for (const file of state.files || []) {
      if (excludeFileId && file?.id === excludeFileId) continue
      const layer = Array.isArray(file?.layers) ? file.layers[targetIndex - 1] : null
      if (layer?.name || layer?.color) return { ...layer }
    }
    return null
  }

  function synthesizeEngravingLayer(
    layers: DxfLayer[],
    settings: SettingsObject = getCurrentNestingSettings(),
    excludeFileId: string | null = null
  ): DxfLayer[] {
    const targetIndex = engravingLayerIndex(settings)
    const sourceLayers = Array.isArray(layers) ? layers.map((layer) => ({ ...layer })) : []
    if (targetIndex === null) return sourceLayers
    if (sourceLayers[targetIndex - 1]?.name) return sourceLayers

    const batchTemplate = batchLayerTemplateAtIndex(targetIndex, excludeFileId)
    const fallbackColor = FALLBACK_PALETTE.length
      ? FALLBACK_PALETTE[(targetIndex - 1) % FALLBACK_PALETTE.length]
      : '#4488FF'
    sourceLayers[targetIndex - 1] = {
      name: batchTemplate?.name || `Layer ${targetIndex}`,
      color: batchTemplate?.color || sourceLayers[targetIndex - 1]?.color || fallbackColor
    }
    return sourceLayers.filter(Boolean)
  }

  async function ensureFileShapes(file: DxfFile): Promise<DxfShape[]> {
    const settings = getCurrentNestingSettings()
    const matchesSketchMode = file._multiSketchDetection === !!settings.multiSketchDetection
    const sketchContourMethod = String(settings?.sketchContourMethod || 'auto')
    const matchesContourMethod =
      String(file?._sketchContourMethod || 'auto') === sketchContourMethod
    const hasUsableShapes = Array.isArray(file.shapes) && file.shapes.length
    const hasExportMetadata =
      hasUsableShapes &&
      file.shapes!.every((shape: DxfShape) => Array.isArray(shape.exportEntities))
    const hasLayerTable = Array.isArray(file.layers) && file.layers.length
    if (
      matchesSketchMode &&
      matchesContourMethod &&
      hasUsableShapes &&
      hasExportMetadata &&
      hasLayerTable
    )
      return file.shapes!
    if (
      !file.path ||
      !window.electronAPI?.parseDXF ||
      typeof window.parseDXFToShapes !== 'function'
    ) {
      throw new Error(`No parsed shapes available for ${file.name}`)
    }

    const result = await window.electronAPI.parseDXF(file.path, file.bookmark || null)
    if (!result?.success || !result.data) {
      throw new Error(result?.error || `Failed to parse ${file.name}`)
    }

    const parsed = window.parseDXFToShapes(result.data, result.raw, settings) as {
      shapes: DxfShape[]
      layers: DxfLayer[]
    }
    if (!parsed?.shapes?.length) {
      throw new Error(`No nestable shapes found in ${file.name}`)
    }

    file.shapes = parsed.shapes.map((shape: DxfShape) => ({
      ...shape,
      qty: file.qty || shape.qty || 1
    }))
    file.layers = synthesizeEngravingLayer(parsed.layers || [], settings, file.id)
    file._multiSketchDetection = !!settings.multiSketchDetection
    file._sketchContourMethod = sketchContourMethod
    file.qty = effectiveFileQty(file)
    return file.shapes
  }

  async function hydrateFileShapesForList(
    file: DxfFile,
    onHydrated: (f: DxfFile) => void
  ): Promise<void> {
    if (!file || !file.path || (Array.isArray(file.shapes) && file.shapes.length)) return
    if (!window.electronAPI?.parseDXF || typeof window.parseDXFToShapes !== 'function') return

    try {
      await ensureFileShapes(file)
      if (typeof onHydrated === 'function') onHydrated(file)
    } catch (error: unknown) {
      console.warn(
        `[DXF] Failed to pre-parse ${file.name}:`,
        error instanceof Error ? error.message : String(error)
      )
    }
  }
  function stripClosingPoint(points: Point[]): Point[] {
    if (!Array.isArray(points) || points.length < 2) return Array.isArray(points) ? [...points] : []
    return sameExportPoint(points[0], points[points.length - 1]) ? points.slice(0, -1) : [...points]
  }

  function isCollinearPoint(prev: Point, point: Point, next: Point): boolean {
    if (!prev || !point || !next) return false
    const abx = point.x - prev.x
    const aby = point.y - prev.y
    const bcx = next.x - point.x
    const bcy = next.y - point.y
    const cross = roundCoord(abx * bcy - aby * bcx)
    if (Math.abs(cross) > 1e-4) return false
    const dot = (point.x - prev.x) * (point.x - next.x) + (point.y - prev.y) * (point.y - next.y)
    return dot <= 1e-8
  }

  function dropCollinearPoints(points: Point[]): Point[] {
    if (!Array.isArray(points) || points.length < 4) return Array.isArray(points) ? [...points] : []
    const filtered = points.filter(
      (point, index, all) =>
        !isCollinearPoint(
          all[(index - 1 + all.length) % all.length],
          point,
          all[(index + 1) % all.length]
        )
    )
    return filtered.length >= 3 ? filtered : points
  }

  function cleanSolverRing(points: Point[]): Point[] {
    const sanitized = sanitizePolygonPoints(points)
    if (sanitized.length < 3) return []
    const openRing = stripClosingPoint(sanitized)
    if (openRing.length < 3) return []
    return dropCollinearPoints(openRing)
  }

  function normalizeSolverRing(points: Point[], origin: Point): Point[] {
    return points.map((point) => ({
      x: roundCoord(point.x - origin.x),
      y: roundCoord(point.y - origin.y)
    }))
  }
  function normalizeExportPoint(point: Point, origin: Point): Point {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return point
    return {
      ...point,
      x: roundCoord(point.x - origin.x),
      y: roundCoord(point.y - origin.y)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function normalizeExportEntity(entity: any, origin: Point): DxfEntityType {
    if (!entity || !origin) return entity
    return {
      ...entity,
      start: normalizeExportPoint(entity.start, origin),
      end: normalizeExportPoint(entity.end, origin),
      center: normalizeExportPoint(entity.center, origin),
      vertices: Array.isArray(entity.vertices)
        ? entity.vertices.map((vertex: Point) => normalizeExportPoint(vertex, origin))
        : entity.vertices,
      fitPoints: Array.isArray(entity.fitPoints)
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (entity as any).fitPoints.map((point: Point) => normalizeExportPoint(point, origin))
        : entity.fitPoints,
      controlPoints: Array.isArray(entity.controlPoints)
        ? (entity as SplineEntity).controlPoints.map((point: Point) =>
            normalizeExportPoint(point, origin)
          )
        : entity.controlPoints
    }
  }

  function buildSolverShapeGeometry(shape: DxfShape): ShapeGeometry | null {
    const outer = cleanSolverRing(shape?.polygonPoints)
    if (outer.length < 3) return null
    const origin = outer.reduce(
      (acc, point) => ({
        x: Math.min(acc.x, point.x),
        y: Math.min(acc.y, point.y)
      }),
      { x: outer[0].x, y: outer[0].y }
    )
    return {
      origin,
      outer: normalizeSolverRing(outer, origin),
      holes: (shape?.holes || [])
        .map((hole: DxfHole) => cleanSolverRing(hole?.points || []))
        .filter((hole: Point[]) => hole.length >= 3)
        .map((hole: Point[]) => normalizeSolverRing(hole, origin))
    }
  }

  async function buildPlacementPayload(): Promise<PlacementPayload> {
    const items: PlacementItem[] = []
    const exportItems: Record<string, ExportItem> = {}
    let nextId = 0
    const settings = getCurrentNestingSettings()
    const allowedOrientations = buildAllowedOrientations(settings.rotationStep)

    for (const file of state.files) {
      await ensureFileShapes(file)
      file.layers = synthesizeEngravingLayer(file.layers || [], settings, file.id)
    }

    for (const file of state.files) {
      const shapes = (await ensureFileShapes(file)).filter(
        (shape: DxfShape) => shape.visible !== false
      )
      shapes.forEach((shape: DxfShape) => {
        const geometry = buildSolverShapeGeometry(shape)
        if (!geometry?.outer?.length) return
        const itemId = nextId++

        items.push({
          id: itemId,
          demand: Math.max(1, parseInt(String(shape.qty || 1), 10)),
          dxf: file.path || file.name,
          allowed_orientations: [...allowedOrientations],
          shape: {
            type: 'simple_polygon',
            data: geometry.outer.map((point: Point) => [point.x, point.y] as [number, number])
          }
        })

        exportItems[itemId] = {
          source_file: file.path || file.name,
          source_name: file.name,
          source_shape_id: shape.id,
          part_label: partLabelFromName(file.name),
          layers: clonePlain(synthesizeEngravingLayer(file.layers || [], settings, file.id)),
          entities: clonePlain(
            (shape.exportEntities || []).map((entity: DxfEntityType) =>
              normalizeExportEntity(entity, geometry.origin)
            )
          ),
          polygon: geometry.outer.map((point: Point) => [point.x, point.y] as [number, number]),
          holes: clonePlain(
            geometry.holes.map((hole: Point[]) =>
              hole.map((point: Point) => [point.x, point.y] as [number, number])
            )
          )
        }
      })
    }

    if (!items.length) {
      throw new Error('No exportable shapes available')
    }

    state.lastPlacementExportItems = exportItems

    return {
      name: buildJobName(state.files),
      settings,
      items,
      sheets: state.sheets.map((sheet: NestSheet) => ({
        id: sheet.id,
        width: sheet.widthMode === 'unlimited' ? null : sheet.width,
        height: sheet.height || 0,
        width_mode: sheet.widthMode || 'fixed',
        quantity: 'auto',
        material: sheet.material || ''
      })),
      strip_height: state.sheets[0]?.height || 0
    }
  }

  async function exportPlacementJSON(): Promise<ExportResult> {
    const payload = await buildPlacementPayload()
    if (!window.electronAPI?.savePlacementJSON) {
      throw new Error('Placement JSON export is not available')
    }

    const result = await window.electronAPI.savePlacementJSON(payload)
    if (!result?.success) {
      throw new Error(result?.error || 'Failed to save placement JSON')
    }

    state.lastExportPath = result.path ?? null
    return {
      payload,
      path: result.path ?? '',
      directory: (result as { directory?: string }).directory
    }
  }

  return {
    ensureFileShapes,
    hydrateFileShapesForList,
    buildPlacementPayload,
    exportPlacementJSON
  }
}
