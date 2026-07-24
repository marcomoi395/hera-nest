import type { Point } from '../../types/geometry'
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

export const DXF_DEBUG = true
const DXF_DEBUG_STORE_KEY = '__NEST_DXF_DEBUG__'

export function debugDXF(label: string, payload: any): void {
  if (!DXF_DEBUG) return
  const store = ensureDebugStore()
  store?.events.push({ at: new Date().toISOString(), label, payload })
  console.log(`[DXF DEBUG] ${label}`, payload)
}

function ensureDebugStore(): any {
  const global = window as any
  if (!global[DXF_DEBUG_STORE_KEY]) {
    global[DXF_DEBUG_STORE_KEY] = {
      events: [],
      reset() {
        this.events.length = 0
        return this
      },
      toJSON() {
        return {
          capturedAt: new Date().toISOString(),
          count: this.events.length,
          events: this.events
        }
      },
      stringify(pretty = false) {
        return JSON.stringify(this.toJSON(), null, pretty ? 2 : 0)
      }
    }
  }
  return global[DXF_DEBUG_STORE_KEY]
}

function isClosedArc(entity: any): boolean {
  if (entity?.type !== 'ARC' || !entity.center || !Number.isFinite(entity.radius)) return false
  let span = Number.isFinite(entity.angleLength)
    ? Math.abs(entity.angleLength)
    : Math.abs((entity.endAngle || 0) - (entity.startAngle || 0))
  while (span > TWO_PI) span -= TWO_PI
  if (span <= 0) span += TWO_PI
  if (span >= TWO_PI - 1e-3) return true
  const endpoints = getArcEndpoints(entity)
  return !!endpoints && samePoint(endpoints.start, endpoints.end, LOOP_TOLERANCE * 4)
}

export function isClosedEntity(entity: any): boolean {
  if (!entity?.type) return false
  if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && entity.vertices?.length >= 3) {
    return entity.closed !== false
  }
  if (entity.type === 'CIRCLE') return true
  if (isClosedArc(entity)) return true
  if (entity.type === 'ELLIPSE') {
    const start = entity.startParameter ?? entity.startAngle ?? 0
    const end = entity.endParameter ?? entity.endAngle ?? TWO_PI
    return Math.abs(Math.abs(end - start) - TWO_PI) < 1e-4 || Math.abs((end - start) % TWO_PI) < 1e-4
  }
  if (entity.type === 'SPLINE') return !!entity.closed && (entity.fitPoints?.length > 2 || entity.controlPoints?.length > 2)
  return false
}

function sampleArcPoints(entity: any, maxStepDeg = 6): Point[] {
  const endpoints = getArcEndpoints(entity)
  if (!entity?.center || !Number.isFinite(entity.radius) || !endpoints) return []
  const start = Number.isFinite(entity.startAngle) ? entity.startAngle : 0
  let end = Number.isFinite(entity.endAngle) ? entity.endAngle : start
  while (end <= start) end += TWO_PI
  const span = end - start
  const step = Math.max((maxStepDeg * Math.PI) / 180, Math.PI / 90)
  const steps = Math.max(8, Math.ceil(Math.abs(span) / step))
  const points: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const angle = start + span * (i / steps)
    points.push({
      x: entity.center.x + entity.radius * Math.cos(angle),
      y: entity.center.y + entity.radius * Math.sin(angle)
    })
  }
  points[0] = endpoints.start
  points[points.length - 1] = endpoints.end
  return points
}

export function contourEntityToPoints(ent: any): Point[] {
  if (!ent?.type) return []
  switch (ent.type) {
    case 'LINE_LOOP':
      return dedupePoints(ent.points || [], true)
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return Array.isArray(ent.vertices) ? polylineVerticesToPoints(ent.vertices, true) : []
    case 'CIRCLE':
      return circleToPoints(ent)
    case 'ARC':
      return isClosedArc(ent)
        ? circleToPoints({ center: ent.center, radius: ent.radius })
        : sampleArcPoints(ent)
    case 'ELLIPSE':
      return ellipseToPoints(ent, true)
    case 'SPLINE':
      return splineToPoints(ent)
    default:
      return []
  }
}

export function contourEntityToPath(ent: any, ox = 0, originMaxY = 0): string {
  const svg = (window as any).NestDxfSvg || {}
  if (ent?.type === 'LINE_LOOP' && ent.orderedEdges?.length) {
    return lineLoopToSVGPath(ent.orderedEdges, ox, originMaxY)
  }
  const points = contourEntityToPoints(ent)
  return typeof svg.pathFromPoints === 'function' ? svg.pathFromPoints(points, ox, originMaxY, true) : ''
}

export function lineLoopToSVGPath(orderedEdges: any[], ox: number, originMaxY: number): string {
  const svg = (window as any).NestDxfSvg || {}
  if (!Array.isArray(orderedEdges) || !orderedEdges.length || typeof svg.f !== 'function') return ''
  const edgeStartPoint = (entity: any, reversed: boolean): Point | null => {
    if (entity.type === 'LINE') {
      const endpoints = getLineEndpoints(entity)
      return endpoints ? (reversed ? endpoints.end : endpoints.start) : null
    }
    if (entity.type === 'ARC') {
      const angle = reversed ? (entity.endAngle || 0) : (entity.startAngle || 0)
      return { x: entity.center.x + entity.radius * Math.cos(angle), y: entity.center.y + entity.radius * Math.sin(angle) }
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
  if (!p0) return ''
  let d = `M${svg.f(p0.x - ox)},${svg.f(originMaxY - p0.y)}`

  orderedEdges.forEach(({ entity, reversed }) => {
    if (entity.type === 'LINE') {
      const endpoints = getLineEndpoints(entity)
      const end = reversed ? endpoints?.start : endpoints?.end
      if (end) d += ` L${svg.f(end.x - ox)},${svg.f(originMaxY - end.y)}`
    } else if (entity.type === 'ARC') {
      const cx = entity.center.x - ox
      const cy = originMaxY - entity.center.y
      const r = entity.radius
      const endAngle = reversed ? (entity.startAngle || 0) : (entity.endAngle || 0)
      let span = Number.isFinite(entity.angleLength) ? entity.angleLength : (entity.endAngle - entity.startAngle)
      if (span <= 0) span += TWO_PI
      if (span >= TWO_PI - 1e-4) span = TWO_PI - 1e-4
      const x2 = cx + r * Math.cos(endAngle)
      const y2 = cy - r * Math.sin(endAngle)
      const large = span > Math.PI ? 1 : 0
      const sweep = reversed ? 1 : 0
      d += ` A${svg.f(r)},${svg.f(r)},0,${large},${sweep},${svg.f(x2)},${svg.f(y2)}`
    } else if (entity.type === 'SPLINE') {
      const pts = splineToPoints(entity)
      const segPts = reversed ? [...pts].reverse() : pts
      segPts.slice(1).forEach((pt: Point) => {
        d += ` L${svg.f(pt.x - ox)},${svg.f(originMaxY - pt.y)}`
      })
    }
  })

  return `${d} Z`
}

export function contourContainsContour(parent: any, child: any): boolean {
  if (!parent?.bbox || !child?.sample) return false
  if (!bboxContainsPoint(parent.bbox, child.sample)) return false
  return pointInPoly(child.sample.x, child.sample.y, parent.points || [])
}

export function contourDepth(contour: any, contourById: Map<any, any>): number {
  let depth = 0
  let current = contour
  while (current?.parentId) {
    depth += 1
    current = contourById.get(current.parentId)
    if (!current) break
  }
  return depth
}

export function contourPreferenceScore(contour: any): number[] {
  const entity = contour?.entity || {}
  return [
    entity.type === 'LINE_LOOP' ? 0 : 1,
    entity.isPrimary ? 1 : 0,
    entity.isSingleLayer ? 1 : 0,
    contour.area || 0
  ]
}

export function compareContourPreference(a: any, b: any): number {
  const aa = contourPreferenceScore(a)
  const bb = contourPreferenceScore(b)
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== bb[i]) return aa[i] - bb[i]
  }
  return 0
}

export function groupByContour(contours: any[]): any[] {
  const contourById = new Map((contours || []).map(contour => [contour.id, contour]))
  return (contours || []).map(contour => ({
    contour,
    depth: contourDepth(contour, contourById)
  }))
}

function collectPointCloud(entities: any[]): Point[] {
  const points: Point[] = []
  ;(entities || []).forEach(entity => {
    const entityPoints = contourEntityToPoints(entity)
    if (entityPoints.length) points.push(...entityPoints)
    const probe = safeSamplePoint(entity)
    if (probe) points.push(probe)
  })
  return points
}

export function sampleEntityPoints(entity: any): Point[] {
  return contourEntityToPoints(entity)
}

export function computeConvexHull(points: Point[]): Point[] {
  const unique: Point[] = []
  const seen = new Set<string>()
  ;(points || []).forEach(point => {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return
    const key = `${point.x.toFixed(6)},${point.y.toFixed(6)}`
    if (seen.has(key)) return
    seen.add(key)
    unique.push({ x: point.x, y: point.y })
  })
  if (unique.length < 3) return closePointRing(unique)

  unique.sort((a, b) => (a.x - b.x) || (a.y - b.y))
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  unique.forEach(point => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop()
    lower.push(point)
  })
  const upper: Point[] = []
  for (let i = unique.length - 1; i >= 0; i--) {
    const point = unique[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop()
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

export function bowyerWatson(_points: Point[]): any[] {
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

export function buildAlphaShapeContours(entities: any[]): any[] {
  const points = collectPointCloud(entities)
  const hull = computeAlphaShape(points)
  if (hull.length < 4) return []
  const bbox = bboxFromPoints(hull)
  return [{
    id: 'alpha_0',
    type: 'LINE_LOOP',
    entity: { type: 'LINE_LOOP', isPrimary: true, isSingleLayer: true },
    points: hull,
    bbox,
    sample: safeSamplePoint({ type: 'LINE_LOOP', vertices: hull }) || hull[0],
    area: Math.abs(polygonSignedArea(hull))
  }]
}

export function buildClosedContoursFromLines(entities: any[]): any[] {
  const contours = (entities || [])
    .filter(isClosedEntity)
    .map((entity, index) => {
      const points = closePointRing(contourEntityToPoints(entity))
      const bbox = entityBBox(entity)
      if (!bbox || points.length < 4) return null
      return {
        id: entity.handle || `cc_${index}`,
        type: entity.type || 'LINE_LOOP',
        entity,
        layer: entity.layer || '0',
        bbox,
        points,
        sample: safeSamplePoint(entity) || points[0],
        area: Math.abs(polygonSignedArea(points.slice(0, -1)))
      }
    })
    .filter(Boolean)

  if (contours.length) return contours

  const hull = computeConvexHull(collectPointCloud(entities))
  if (hull.length < 4) return []
  return [{
    id: 'hull_0',
    type: 'LINE_LOOP',
    entity: { type: 'LINE_LOOP', isPrimary: true, isSingleLayer: true },
    layer: (entities || [])[0]?.layer || '0',
    bbox: bboxFromPoints(hull),
    points: hull,
    sample: hull[0],
    area: Math.abs(polygonSignedArea(hull.slice(0, -1)))
  }]
}

export function createDxfShapeDetectionService(deps: { geometry: any; svg: any; concaveman?: any }) {
  const geometry = deps.geometry || (window as any).NestDxfGeometry
  const svg = deps.svg || (window as any).NestDxfSvg

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
