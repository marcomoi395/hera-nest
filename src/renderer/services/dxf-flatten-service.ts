import type { Point } from '../../types/geometry'
// @ts-ignore - Flatten.js loaded globally via window
declare const Flatten: any


import {
  EPS,
  TWO_PI,
  LOOP_TOLERANCE,
  getLineEndpoints,
  bulgeToArcInfo,
  polylineVerticesToPoints,
  ellipseToPoints,
  splineToPoints,
  circleToPoints,
  polygonSignedArea,
  entityBBox,
  safeSamplePoint,
  closePointRing
} from '../utils/dxf-geometry'

export function isEntityClosed(entity: any): boolean {
  if (!entity?.type) return false
  if (entity.type === 'CIRCLE') return true
  if (
    (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') &&
    entity.vertices?.length >= 3
  ) {
    return entity.closed !== false
  }
  if (entity.type === 'ELLIPSE') {
    const start = entity.startParameter ?? entity.startAngle ?? 0
    const end = entity.endParameter ?? entity.endAngle ?? TWO_PI
    return (
      Math.abs(Math.abs(end - start) - TWO_PI) < 1e-4 || Math.abs((end - start) % TWO_PI) < 1e-4
    )
  }
  if (entity.type === 'SPLINE') return !!entity.closed
  return false
}

export function sampleArcPoints(entity: any): Point[] {
  if (!entity?.center || !Number.isFinite(entity.radius)) return []
  const start = Number.isFinite(entity.startAngle) ? entity.startAngle : 0
  const rawEnd = Number.isFinite(entity.endAngle) ? entity.endAngle : start
  let end = rawEnd
  while (end <= start) end += TWO_PI
  const span = end - start
  const steps = Math.max(12, Math.ceil(span / (Math.PI / 18)))
  const points: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const angle = start + span * t
    points.push({
      x: entity.center.x + entity.radius * Math.cos(angle),
      y: entity.center.y + entity.radius * Math.sin(angle)
    })
  }
  return points
}

export function entityToPolylinePoints(entity: any): Point[] {
  if (!entity?.type) return []
  switch (entity.type) {
    case 'LINE': {
      const endpoints = getLineEndpoints(entity)
      return endpoints ? [endpoints.start, endpoints.end] : []
    }
    case 'ARC':
      return sampleArcPoints(entity)
    case 'CIRCLE':
      return circleToPoints(entity)
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return Array.isArray(entity.vertices)
        ? polylineVerticesToPoints(entity.vertices, entity.closed !== false)
        : []
    case 'ELLIPSE':
      return ellipseToPoints(entity, isEntityClosed(entity))
    case 'SPLINE':
      return splineToPoints(entity)
    default:
      return []
  }
}

function polylineShapesFromVertices(vertices: any[], close: boolean): any[] {
  if (!Array.isArray(vertices) || vertices.length < 2) return []
  const shapes: any[] = []
  const segmentCount = close ? vertices.length : vertices.length - 1
  for (let i = 0; i < segmentCount; i++) {
    const start = vertices[i]
    const end = vertices[(i + 1) % vertices.length]
    if (!start || !end) continue
    const bulge = start.bulge || 0
    if (Math.abs(bulge) > EPS) {
      const arc = bulgeToArcInfo(start, end, bulge)
      if (arc && Number.isFinite(arc.radius) && arc.radius > EPS) {
        shapes.push(new Flatten.Arc(
          new Flatten.Point(arc.center.x, arc.center.y),
          arc.radius,
          arc.startAngle,
          arc.endAngle,
          arc.theta >= 0
        ))
        continue
      }
    }
    if (Math.hypot(end.x - start.x, end.y - start.y) <= EPS) continue
    shapes.push(new Flatten.Segment(
      new Flatten.Point(start.x, start.y),
      new Flatten.Point(end.x, end.y)
    ))
  }
  return shapes
}

function sampledSegmentShapes(points: Point[], close: boolean): any[] {
  const shapes: any[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (!a || !b) continue
    if (Math.hypot(b.x - a.x, b.y - a.y) <= EPS) continue
    shapes.push(new Flatten.Segment(new Flatten.Point(a.x, a.y), new Flatten.Point(b.x, b.y)))
  }
  if (close && points.length > 2) {
    const a = points[points.length - 1]
    const b = points[0]
    if (Math.hypot(b.x - a.x, b.y - a.y) > EPS) {
      shapes.push(new Flatten.Segment(new Flatten.Point(a.x, a.y), new Flatten.Point(b.x, b.y)))
    }
  }
  return shapes
}

function entityToFlattenPolygon(entity: any): any {
  if (!isEntityClosed(entity)) return null
  try {
    if (entity.type === 'CIRCLE' && entity.center && Number.isFinite(entity.radius)) {
      const polygon = new Flatten.Polygon()
      polygon.addFace([
        new Flatten.Circle(
          new Flatten.Point(entity.center.x, entity.center.y),
          entity.radius
        ).toArc(true)
      ])
      return polygon
    }

    if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && Array.isArray(entity.vertices) && entity.vertices.length >= 2) {
      const shapes = polylineShapesFromVertices(entity.vertices, entity.closed !== false)
      if (!shapes.length) return null
      const polygon = new Flatten.Polygon()
      polygon.addFace(shapes)
      return polygon
    }

    if (entity.type === 'ELLIPSE' || entity.type === 'SPLINE') {
      const points = entityToPolylinePoints(entity)
      if (points.length < 3) return null
      const polygon = new Flatten.Polygon()
      polygon.addFace(sampledSegmentShapes(points, true))
      return polygon
    }
  } catch {
    return null
  }
  return null
}

function sampleFlattenArc(arc: any, includeStart = true): Point[] {
  const delta = arc.counterClockwise ? arc.sweep : -arc.sweep
  const steps = Math.max(12, Math.ceil(Math.abs(delta) / (Math.PI / 18)))
  const points: Point[] = []
  const startIndex = includeStart ? 0 : 1
  for (let i = startIndex; i <= steps; i++) {
    const t = i / steps
    const angle = arc.startAngle + delta * t
    points.push({
      x: arc.pc.x + arc.r * Math.cos(angle),
      y: arc.pc.y + arc.r * Math.sin(angle)
    })
  }
  return points
}

function faceToPoints(face: any): Point[] {
  const points: Point[] = []
  for (const edge of face) {
    const shape = edge.shape
    if (!shape) continue
    if (shape instanceof Flatten.Segment) {
      if (!points.length) points.push({ x: shape.start.x, y: shape.start.y })
      points.push({ x: shape.end.x, y: shape.end.y })
      continue
    }
    if (shape instanceof Flatten.Arc) {
      points.push(...sampleFlattenArc(shape, !points.length))
    }
  }
  return closePointRing(points)
}

export function entityToFlattenRecord(entity: any): any {
  const points = entityToPolylinePoints(entity)
  const bbox = entityBBox(entity)
  if (!bbox) return null

  const segments: any[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (!a || !b) continue
    if (Math.hypot(b.x - a.x, b.y - a.y) <= EPS) continue
    segments.push(new Flatten.Segment(new Flatten.Point(a.x, a.y), new Flatten.Point(b.x, b.y)))
  }
  if (isEntityClosed(entity) && points.length > 2) {
    const a = points[points.length - 1]
    const b = points[0]
    if (Math.hypot(b.x - a.x, b.y - a.y) > EPS) {
      segments.push(new Flatten.Segment(new Flatten.Point(a.x, a.y), new Flatten.Point(b.x, b.y)))
    }
  }

  let polygon = null
  if (isEntityClosed(entity) && points.length >= 3) {
    try {
      polygon = new Flatten.Polygon(points.map(point => [point.x, point.y]))
    } catch {
      polygon = null
    }
  }

  return {
    entity,
    bbox,
    points,
    segments,
    polygon,
    samplePoint: safeSamplePoint(entity),
    closed: isEntityClosed(entity)
  }
}

export function sampledClosedEntityPolygon(entity: any): any {
  if (!isEntityClosed(entity)) return null
  const polygonPoints = closePointRing(entityToPolylinePoints(entity))
  if (polygonPoints.length < 4) return null
  const area = Math.abs(polygonSignedArea(polygonPoints.slice(0, -1)))
  if (!Number.isFinite(area) || area <= EPS) return null
  return {
    polygonPoints,
    area,
    faceCount: 1
  }
}

export function extractPolygonForEntities(entities: any[]): any {
  const polygonEntries = entities
    .map(entity => ({
      entity,
      polygon: entityToFlattenPolygon(entity)
    }))
    .filter(entry => entry.polygon)
  if (!polygonEntries.length) return null

  const sampledFallback = polygonEntries.length === 1
    ? sampledClosedEntityPolygon(polygonEntries[0].entity)
    : null

  let merged = polygonEntries[0].polygon
  for (let i = 1; i < polygonEntries.length; i++) {
    try {
      merged = Flatten.BooleanOperations.unify(merged, polygonEntries[i].polygon)
    } catch {
      // Keep the polygons we can merge; disconnected faces are still preserved
      // by unify when it succeeds, so failure here just means we skip this one.
    }
  }

  const faces = [...merged.faces]
  if (!faces.length) return sampledFallback

  const rankedFaces = faces
    .slice()
    .sort((a, b) => {
      const areaDelta = Math.abs(b.area()) - Math.abs(a.area())
      if (Math.abs(areaDelta) > EPS) return areaDelta
      return Math.abs(b.orientation()) - Math.abs(a.orientation())
    })
  const primary = rankedFaces[0]
  if (!primary) return sampledFallback

  const polygonPoints = faceToPoints(primary)
  if (polygonPoints.length < 4) return sampledFallback

  const primaryArea = Math.abs(primary.area())
  if (sampledFallback) {
    const sampledArea = sampledFallback.area
    const sampledRatioMin = sampledArea * 0.25
    const sampledRatioMax = sampledArea * 4
    const polygonArea = Math.abs(polygonSignedArea(polygonPoints.slice(0, -1)))
    const referenceArea = Number.isFinite(polygonArea) && polygonArea > EPS ? polygonArea : primaryArea
    const suspiciousMismatch = !Number.isFinite(referenceArea) ||
      referenceArea <= EPS ||
      referenceArea < sampledRatioMin ||
      referenceArea > sampledRatioMax

    if (suspiciousMismatch) return sampledFallback
  }

  return {
    polygonPoints,
    area: primaryArea,
    faceCount: faces.length
  }
}

function bboxGap(a: any, b: any): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX)
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY)
  return Math.hypot(dx, dy)
}

function recordsConnected(a: any, b: any): boolean {
  if (!a || !b) return false
  if (bboxGap(a.bbox, b.bbox) > LOOP_TOLERANCE * 20) return false

  for (const sa of a.segments) {
    for (const sb of b.segments) {
      if (sa.intersect(sb).length) return true
      if (sa.ps.distanceTo(sb.ps)[0] <= LOOP_TOLERANCE) return true
      if (sa.ps.distanceTo(sb.pe)[0] <= LOOP_TOLERANCE) return true
      if (sa.pe.distanceTo(sb.ps)[0] <= LOOP_TOLERANCE) return true
      if (sa.pe.distanceTo(sb.pe)[0] <= LOOP_TOLERANCE) return true
    }
  }

  if (a.polygon && b.samplePoint) {
    try {
      if (a.polygon.contains(new Flatten.Point(b.samplePoint.x, b.samplePoint.y))) return true
    } catch {}
  }
  if (b.polygon && a.samplePoint) {
    try {
      if (b.polygon.contains(new Flatten.Point(a.samplePoint.x, a.samplePoint.y))) return true
    } catch {}
  }

  return false
}

export function buildSketchGroups(entities: any[]): any[][] {
  const records = entities
    .map(entityToFlattenRecord)
    .filter(Boolean)
  if (!records.length) return []

  const parent = records.map((_, index) => index)
  const find = (index: number): number => {
    let current = index
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]]
      current = parent[current]
    }
    return current
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      if (recordsConnected(records[i], records[j])) union(i, j)
    }
  }

  const groups = new Map<number, any[]>()
  records.forEach((record, index) => {
    const root = find(index)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(record.entity)
  })

  return [...groups.values()].sort((a, b) => b.length - a.length)
}
