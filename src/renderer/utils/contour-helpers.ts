import { EPS, unionBBox, entityBBox, BoundingBox } from './dxf-geometry'

export interface ContourResult {
  polygonPoints: unknown | null
  source: unknown | null
  coverage: unknown | null
  rankedCandidates: unknown[]
  builderMode: string
  builderDebug: unknown | null
}

export interface ContourCandidate {
  area?: number
  mergeCount?: number
  closureGap?: number
  pathLength?: number
}

export function emptyContourResult(
  builderMode: string,
  builderDebug: unknown | null = null
): ContourResult {
  return {
    polygonPoints: null,
    source: null,
    coverage: null,
    rankedCandidates: [],
    builderMode,
    builderDebug
  }
}

export function computeEntitiesBBox(entities: unknown[]): BoundingBox | null {
  let bbox: BoundingBox | null = null
  ;(entities || []).forEach((entity) => {
    bbox = unionBBox(bbox, entityBBox(entity))
  })
  return bbox
}

export function bboxSpan(bbox: BoundingBox | null | undefined): number {
  if (!bbox) return 0
  return Math.max(EPS, bbox.maxX - bbox.minX, bbox.maxY - bbox.minY)
}

export function compareContourCandidatesByGeometry(
  a: ContourCandidate,
  b: ContourCandidate
): number {
  if (Math.abs((b.area || 0) - (a.area || 0)) > EPS) return (b.area || 0) - (a.area || 0)
  if ((a.mergeCount || 0) !== (b.mergeCount || 0)) return (a.mergeCount || 0) - (b.mergeCount || 0)
  if (Math.abs((a.closureGap || 0) - (b.closureGap || 0)) > EPS)
    return (a.closureGap || 0) - (b.closureGap || 0)
  return (b.pathLength || 0) - (a.pathLength || 0)
}
