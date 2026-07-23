import type { Point } from '../../types/geometry'
import type { BoundingBox } from '../utils/dxf-geometry'
import {
  EPS,
  entityBBox,
  unionBBox,
  closePointRing,
  polygonSignedArea
} from '../utils/dxf-geometry'

interface RasterEnvelopeOptions {
  strokeRadius?: number
  sampleStep?: number
  paddingCells?: number
}

interface RasterEnvelope {
  polygonPoints: Point[] | null
  entities: unknown[]
  bbox: BoundingBox | null
  area: number
}

// Build raster (grid-based) envelopes around open or scattered entities
export function buildRasterEnvelopes(entities: unknown[], options: RasterEnvelopeOptions = {}): RasterEnvelope[] {
  if (!Array.isArray(entities) || !entities.length) return []

  const paddingCells = options.paddingCells ?? 3
  const cellSize = Math.max(EPS, options.sampleStep ?? 1)
  const strokeRadius = options.strokeRadius ?? 0

  // Compute bounding box of all entities
  let combinedBbox: BoundingBox | null = null
  for (const entity of entities) {
    const bbox = entityBBox(entity)
    combinedBbox = unionBBox(combinedBbox, bbox)
  }

  if (!combinedBbox) return []

  // Expand bbox by stroke radius and padding
  const padding = (paddingCells + 0.5) * cellSize + strokeRadius
  const expandedBbox: BoundingBox = {
    minX: combinedBbox.minX - padding,
    maxX: combinedBbox.maxX + padding,
    minY: combinedBbox.minY - padding,
    maxY: combinedBbox.maxY + padding
  }

  // Generate grid corners as envelope
  const corners: Point[] = [
    { x: expandedBbox.minX, y: expandedBbox.minY },
    { x: expandedBbox.maxX, y: expandedBbox.minY },
    { x: expandedBbox.maxX, y: expandedBbox.maxY },
    { x: expandedBbox.minX, y: expandedBbox.maxY }
  ]

  const polygonPoints = closePointRing(corners)
  const area = Math.abs(polygonSignedArea(polygonPoints.slice(0, -1)))

  return [
    {
      polygonPoints,
      entities,
      bbox: expandedBbox,
      area
    }
  ]
}

// Detect raster shapes from entities
export function detectRasterShapes(entities: unknown[], options: RasterEnvelopeOptions = {}): RasterEnvelope[] {
  // For now, this is an alias for buildRasterEnvelopes
  // Can be extended in future for more sophisticated raster shape detection
  return buildRasterEnvelopes(entities, options)
}

export function createDxfRasterEnvelopeService(_deps: unknown) {
  return {
    buildRasterEnvelopes,
    detectRasterShapes
  }
}
