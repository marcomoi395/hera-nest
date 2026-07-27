import type { Point } from '../../types/geometry-types'

export const EPS = 1e-6
export const TWO_PI = Math.PI * 2
export const LOOP_TOLERANCE = 1e-3

export interface BoundingBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export function pointInPoly(px: number, py: number, vertices: Point[]): boolean {
  let inside = false
  const n = vertices.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x
    const yi = vertices[i].y
    const xj = vertices[j].x
    const yj = vertices[j].y
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function dist(a: Point | null | undefined, b: Point | null | undefined): number {
  return Math.hypot((b?.x || 0) - (a?.x || 0), (b?.y || 0) - (a?.y || 0))
}

export function samePoint(
  a: Point | null | undefined,
  b: Point | null | undefined,
  eps = 1e-4
): boolean {
  return !!a && !!b && Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps
}

export function getLineEndpoints(ent: DXFEntity): { start: Point; end: Point } | null {
  if (!ent || ent.type !== 'LINE') return null
  if (
    ent.start &&
    ent.end &&
    Number.isFinite(ent.start.x) &&
    Number.isFinite(ent.start.y) &&
    Number.isFinite(ent.end.x) &&
    Number.isFinite(ent.end.y)
  ) {
    return { start: ent.start, end: ent.end }
  }
  if (Array.isArray(ent.vertices) && ent.vertices.length >= 2) {
    const start = ent.vertices[0]
    const end = ent.vertices[ent.vertices.length - 1]
    if (
      Number.isFinite(start?.x) &&
      Number.isFinite(start?.y) &&
      Number.isFinite(end?.x) &&
      Number.isFinite(end?.y)
    ) {
      return { start, end }
    }
  }
  return null
}

export function getArcEndpoints(ent: DXFEntity): { start: Point; end: Point } | null {
  if (!ent || ent.type !== 'ARC' || !ent.center || !Number.isFinite(ent.radius)) return null
  const startAngle = Number.isFinite(ent.startAngle) ? ent.startAngle : 0
  const endAngle = Number.isFinite(ent.endAngle) ? ent.endAngle : 0
  return {
    start: {
      x: ent.center.x + ent.radius * Math.cos(startAngle),
      y: ent.center.y + ent.radius * Math.sin(startAngle)
    },
    end: {
      x: ent.center.x + ent.radius * Math.cos(endAngle),
      y: ent.center.y + ent.radius * Math.sin(endAngle)
    }
  }
}

export function pointKey(point: Point, eps = LOOP_TOLERANCE): string {
  return `${Math.round(point.x / eps)},${Math.round(point.y / eps)}`
}

export function dedupePoints(points: (Point | null | undefined)[], closed = false): Point[] {
  const out: Point[] = []
  points.forEach((point) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return
    if (!out.length || !samePoint(out[out.length - 1], point)) out.push({ x: point.x, y: point.y })
  })
  if (closed && out.length > 2 && samePoint(out[0], out[out.length - 1])) out.pop()
  return out
}

export function pointSig(point: Point, precision = 1e-4): string {
  return `${Math.round(point.x / precision)},${Math.round(point.y / precision)}`
}

export function normalizedClosedPointSignature(points: Point[], precision = 1e-4): string {
  const ring = dedupePoints(points, true)
  if (!ring.length) return ''
  const forward = ring.map((point) => pointSig(point, precision))
  const backward = [...forward].reverse()
  const rotations = (sequence: string[]): string[] => {
    const out: string[] = []
    for (let i = 0; i < sequence.length; i++) {
      out.push(sequence.slice(i).concat(sequence.slice(0, i)).join('|'))
    }
    return out
  }
  return [...rotations(forward), ...rotations(backward)].sort()[0] || ''
}

export function bboxFromPoints(points: Point[]): BoundingBox | null {
  if (!points.length) return null
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  }
}

export function polygonSignedArea(points: Point[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}

export function normalizeWindingCCW(points: Point[]): Point[] {
  if (polygonSignedArea(points) < 0) points.reverse()
  return points
}

export function interiorPoint(points: Point[]): Point | null {
  if (!points.length) return null
  const avg = points.reduce(
    (acc, point) => ({
      x: acc.x + point.x / points.length,
      y: acc.y + point.y / points.length
    }),
    { x: 0, y: 0 }
  )
  if (pointInPoly(avg.x, avg.y, points)) return avg
  const a = points[0]
  const b = points[1] || points[0]
  const c = points[2] || points[0]
  return {
    x: (a.x + b.x + c.x) / 3,
    y: (a.y + b.y + c.y) / 3
  }
}

export function bboxContainsPoint(bbox: BoundingBox, point: Point, eps = 1e-4): boolean {
  return (
    point.x >= bbox.minX - eps &&
    point.x <= bbox.maxX + eps &&
    point.y >= bbox.minY - eps &&
    point.y <= bbox.maxY + eps
  )
}

export function unionBBox(
  a: BoundingBox | null | undefined,
  b: BoundingBox | null | undefined
): BoundingBox | null {
  if (!a) return b || null
  if (!b) return a || null
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  }
}

export function normalizeAngleSpan(
  start: number,
  end: number,
  ccw: boolean
): { start: number; end: number } {
  const s = start
  let e = end
  if (ccw) {
    while (e <= s) e += TWO_PI
  } else {
    while (e >= s) e -= TWO_PI
  }
  return { start: s, end: e }
}

export function bulgeToArcInfo(
  start: Point,
  end: Point,
  bulge: number
): { center: Point; radius: number; startAngle: number; endAngle: number; theta: number } | null {
  if (!bulge || Math.abs(bulge) < EPS) return null
  const chord = dist(start, end)
  if (chord < EPS) return null
  // unused
  const radius = (chord * (1 + bulge * bulge)) / (4 * Math.abs(bulge))
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const ux = (end.x - start.x) / chord
  const uy = (end.y - start.y) / chord
  const leftNormal = { x: -uy, y: ux }
  const offset = (chord * (1 - bulge * bulge)) / (4 * bulge)
  const center = { x: mid.x + leftNormal.x * offset, y: mid.y + leftNormal.y * offset }
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
  const rawEndAngle = Math.atan2(end.y - center.y, end.x - center.x)
  const span = normalizeAngleSpan(startAngle, rawEndAngle, bulge > 0)
  return {
    center,
    radius,
    startAngle: span.start,
    endAngle: span.end,
    theta: span.end - span.start
  }
}

export function bulgeToPoints(start: Point, end: Point, bulge: number, maxStepDeg = 12): Point[] {
  if (!bulge || Math.abs(bulge) < EPS) return [{ x: end.x, y: end.y }]
  const arc = bulgeToArcInfo(start, end, bulge)
  if (!arc) return []
  const delta = arc.theta
  const step = (maxStepDeg * Math.PI) / 180
  const steps = Math.max(2, Math.ceil(Math.abs(delta) / step))
  const points: Point[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const angle = arc.startAngle + delta * t
    points.push({
      x: arc.center.x + arc.radius * Math.cos(angle),
      y: arc.center.y + arc.radius * Math.sin(angle)
    })
  }
  return points
}

export function ellipseToPoints(ent: DXFEntity, forceClosed = false): Point[] {
  if (!ent.center || !ent.majorAxisEndPoint) return []
  const rx = Math.hypot(ent.majorAxisEndPoint.x, ent.majorAxisEndPoint.y)
  const ry = rx * Math.abs(ent.axisRatio || 1)
  if (rx < EPS || ry < EPS) return []
  const baseAngle = Math.atan2(ent.majorAxisEndPoint.y, ent.majorAxisEndPoint.x)
  const startParam = ent.startParameter ?? ent.startAngle ?? 0
  const endParamRaw = ent.endParameter ?? ent.endAngle ?? TWO_PI
  const closed =
    forceClosed ||
    Math.abs((endParamRaw - startParam) % TWO_PI) < 1e-4 ||
    Math.abs(Math.abs(endParamRaw - startParam) - TWO_PI) < 1e-4
  const span = normalizeAngleSpan(startParam, endParamRaw, true)
  const delta = closed ? TWO_PI : span.end - span.start
  const stepCount = Math.max(24, Math.ceil(Math.abs(delta) / (Math.PI / 18)))
  const points: Point[] = []
  for (let i = 0; i <= stepCount; i++) {
    if (!closed && i === stepCount) {
      const angle = span.start + delta
      points.push({
        x:
          ent.center.x +
          rx * Math.cos(angle) * Math.cos(baseAngle) -
          ry * Math.sin(angle) * Math.sin(baseAngle),
        y:
          ent.center.y +
          rx * Math.cos(angle) * Math.sin(baseAngle) +
          ry * Math.sin(angle) * Math.cos(baseAngle)
      })
      break
    }
    if (closed && i === stepCount) break
    const t = i / stepCount
    const angle = span.start + delta * t
    points.push({
      x:
        ent.center.x +
        rx * Math.cos(angle) * Math.cos(baseAngle) -
        ry * Math.sin(angle) * Math.sin(baseAngle),
      y:
        ent.center.y +
        rx * Math.cos(angle) * Math.sin(baseAngle) +
        ry * Math.sin(angle) * Math.cos(baseAngle)
    })
  }
  return dedupePoints(points, closed)
}

export function polylineVerticesToPoints(vertices: DXFVertex[], close = true): Point[] {
  if (!vertices || vertices.length < 2) return []
  const points = [{ x: vertices[0].x, y: vertices[0].y }]
  for (let i = 0; i < vertices.length - 1; i++) {
    points.push(...bulgeToPoints(vertices[i], vertices[i + 1], vertices[i].bulge || 0))
  }
  if (close) {
    const last = vertices[vertices.length - 1]
    points.push(...bulgeToPoints(last, vertices[0], last.bulge || 0))
  }
  return dedupePoints(points, close)
}

export function splineToPoints(ent: DXFEntity): Point[] {
  const raw = ent.fitPoints && ent.fitPoints.length > 1 ? ent.fitPoints : ent.controlPoints || []
  return dedupePoints(
    raw.map((point: Point) => ({ x: point.x, y: point.y })),
    !!ent.closed
  )
}

export function circleToPoints(ent: DXFEntity): Point[] {
  if (!ent.center || !ent.radius || ent.radius < EPS) return []
  const steps = 48
  const points: Point[] = []
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * TWO_PI
    points.push({
      x: ent.center.x + ent.radius * Math.cos(angle),
      y: ent.center.y + ent.radius * Math.sin(angle)
    })
  }
  return points
}

export function samplePoint(ent: DXFEntity): Point | null {
  if (!ent || typeof ent !== 'object') return null
  switch (ent.type) {
    case 'CIRCLE':
    case 'ARC':
    case 'ELLIPSE':
      return ent.center && Number.isFinite(ent.center.x) && Number.isFinite(ent.center.y)
        ? ent.center
        : null
    case 'LINE': {
      const endpoints = getLineEndpoints(ent)
      if (!endpoints) return null
      return {
        x: (endpoints.start.x + endpoints.end.x) / 2,
        y: (endpoints.start.y + endpoints.end.y) / 2
      }
    }
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return (
        ent.vertices?.find(
          (vertex: DXFVertex) => Number.isFinite(vertex?.x) && Number.isFinite(vertex?.y)
        ) || null
      )
    case 'SPLINE': {
      const points = ent.fitPoints && ent.fitPoints.length ? ent.fitPoints : ent.controlPoints || []
      const valid = points.filter(
        (point: Point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)
      )
      return valid[Math.floor(valid.length / 2)] || null
    }
    default:
      return null
  }
}

export function safeSamplePoint(ent: DXFEntity): Point | null {
  try {
    return samplePoint(ent)
  } catch {
    return null
  }
}

export function vectorBetween(a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: dx / len, y: dy / len }
}

export function angleDelta(a: Point, b: Point): number {
  const dot = a.x * b.x + a.y * b.y
  const cross = a.x * b.y - a.y * b.x
  return Math.abs(Math.atan2(cross, dot))
}

export function entityBBox(ent: DXFEntity): BoundingBox | null {
  const xs: number[] = []
  const ys: number[] = []
  switch (ent.type) {
    case 'LWPOLYLINE':
    case 'POLYLINE':
      if (!ent.vertices) return null
      polylineVerticesToPoints(ent.vertices, ent.closed !== false).forEach((vertex) => {
        xs.push(vertex.x)
        ys.push(vertex.y)
      })
      break
    case 'LINE': {
      const endpoints = getLineEndpoints(ent)
      if (!endpoints) return null
      xs.push(endpoints.start.x, endpoints.end.x)
      ys.push(endpoints.start.y, endpoints.end.y)
      break
    }
    case 'CIRCLE':
    case 'ARC':
      xs.push(ent.center.x - ent.radius, ent.center.x + ent.radius)
      ys.push(ent.center.y - ent.radius, ent.center.y + ent.radius)
      break
    case 'ELLIPSE':
      ellipseToPoints(ent, false).forEach((point) => {
        xs.push(point.x)
        ys.push(point.y)
      })
      break
    case 'SPLINE':
      splineToPoints(ent).forEach((point) => {
        xs.push(point.x)
        ys.push(point.y)
      })
      break
    default:
      return null
  }
  if (!xs.length) return null
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  }
}

export function closePointRing(points: Point[]): Point[] {
  const ring = dedupePoints(points, true)
  if (!ring.length) return []
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (!samePoint(first, last)) ring.push({ x: first.x, y: first.y })
  return ring
}
