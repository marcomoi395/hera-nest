import type { Point } from '../../types/geometry'
import { getLineEndpoints, polylineVerticesToPoints, TWO_PI } from './dxf-geometry'

/**
 * Short coordinate formatters used wherever SVG output is serialised.
 * f rounds to 3 decimal places; f1 to 1 — keeping the output compact
 * without accumulating visible rounding error.
 */
export const f = (n: number | string): string => (+n).toFixed(3)
export const f1 = (n: number | string): string => (+n).toFixed(1)

/**
 * Creates a seeded Park-Miller LCG pseudo-random number generator.
 * Used for mock DXF data so the same filename always produces the same shapes.
 */
export function mkRng(seed: number): () => number {
  let s = seed & 0x7fffffff || 1
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/**
 * djb2 string hash — converts a filename string to a stable integer seed
 * so mkRng produces a deterministic sequence for each file.
 */
export function hashStr(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0
  return h
}

/**
 * Converts a point array to an SVG path string (M…L…Z). The ox and originMaxY
 * parameters flip DXF coordinates (Y-up, arbitrary origin) into SVG space
 * (Y-down, top-left origin).
 */
export function pathFromPoints(
  points: Point[],
  ox: number,
  originMaxY: number,
  close = true
): string {
  if (!points || points.length < 2) return ''
  const tx = (point: Point) => point.x - ox
  const ty = (point: Point) => originMaxY - point.y
  let d = `M${f(tx(points[0]))},${f(ty(points[0]))}`
  for (let i = 1; i < points.length; i++) {
    d += ` L${f(tx(points[i]))},${f(ty(points[i]))}`
  }
  if (close) d += ' Z'
  return d
}

/**
 * Builds the SVG arc path for a DXF ARC entity, applying the DXF-to-SVG
 * coordinate flip. Full circles are handled by CIRCLE entities elsewhere;
 * ARC entities remain open so the preview matches the source geometry.
 */
export function arcEntPath(ent: any, ox: number, originMaxY: number): string {
  if (!ent.center || !Number.isFinite(ent.radius)) return ''
  const cx = ent.center.x - ox
  const cy = originMaxY - ent.center.y
  const r = ent.radius
  const sR = ent.startAngle || 0
  const eR = ent.endAngle || 0
  const x1 = cx + r * Math.cos(sR)
  const y1 = cy - r * Math.sin(sR)
  const x2 = cx + r * Math.cos(eR)
  const y2 = cy - r * Math.sin(eR)
  let span = Number.isFinite(ent.angleLength) ? ent.angleLength : eR - sR
  if (span <= 0) span += TWO_PI
  const large = span > Math.PI ? 1 : 0
  return `M${f(x1)},${f(y1)} A${f(r)},${f(r)},0,${large},0,${f(x2)},${f(y2)}`
}

/**
 * Renders a SPLINE as a smooth cubic Bézier SVG path using Catmull-Rom
 * tangent estimation, giving a visually accurate curve without needing
 * full B-spline evaluation.
 */
export function splinePath(ent: any, ox: number, originMaxY: number): string {
  const raw = ent.fitPoints && ent.fitPoints.length > 1 ? ent.fitPoints : ent.controlPoints || []
  if (raw.length < 2) return ''
  const pts = raw.map((point: any) => ({ x: point.x - ox, y: originMaxY - point.y }))
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`
  if (pts.length === 2) return d + ` L${f(pts[1].x)},${f(pts[1].y)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    d +=
      ` C${f(p1.x + (p2.x - p0.x) / 6)},${f(p1.y + (p2.y - p0.y) / 6)},` +
      `${f(p2.x - (p3.x - p1.x) / 6)},${f(p2.y - (p3.y - p1.y) / 6)},` +
      `${f(p2.x)},${f(p2.y)}`
  }
  if (ent.closed) d += ' Z'
  return d
}

/**
 * Dispatches to the correct SVG path builder for each DXF entity type and
 * returns a ready-to-embed SVG element string. Used to render decor items
 * (non-outline entities) inside shape preview thumbnails.
 */
export function entityToSVGStr(ent: any, ox: number, originMaxY: number, color: string): string {
  const sw = `stroke="${color}" stroke-width="0.8" opacity="0.85" fill="none"`
  switch (ent.type) {
    case 'LINE': {
      const endpoints = getLineEndpoints(ent)
      if (!endpoints) return ''
      const x1 = f(endpoints.start.x - ox)
      const y1 = f(originMaxY - endpoints.start.y)
      const x2 = f(endpoints.end.x - ox)
      const y2 = f(originMaxY - endpoints.end.y)
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${sw} stroke-linecap="round"/>`
    }
    case 'CIRCLE': {
      if (!ent.center || !Number.isFinite(ent.radius)) return ''
      const cx = f(ent.center.x - ox)
      const cy = f(originMaxY - ent.center.y)
      const r = f(ent.radius)
      return `<circle cx="${cx}" cy="${cy}" r="${r}" ${sw}/>`
    }
    case 'ARC': {
      const d = arcEntPath(ent, ox, originMaxY)
      return d ? `<path d="${d}" ${sw} stroke-linecap="round"/>` : ''
    }
    case 'ELLIPSE': {
      if (!ent.center || !ent.majorAxisEndPoint) return ''
      const cx = f(ent.center.x - ox)
      const cy = f(originMaxY - ent.center.y)
      const rxStr = Math.hypot(ent.majorAxisEndPoint.x, ent.majorAxisEndPoint.y)
      const rx = f(rxStr)
      const ry = f(+rxStr * (ent.axisRatio || 1))
      const ang = f((-Math.atan2(ent.majorAxisEndPoint.y, ent.majorAxisEndPoint.x) * 180) / Math.PI)
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${ang} ${cx} ${cy})" ${sw}/>`
    }
    case 'SPLINE': {
      const d = splinePath(ent, ox, originMaxY)
      return d ? `<path d="${d}" ${sw} stroke-linecap="round" stroke-linejoin="round"/>` : ''
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      if (!ent.vertices || ent.vertices.length < 2) return ''
      const isClosed = ent.closed !== false
      const points = polylineVerticesToPoints(ent.vertices, isClosed)
      const d = pathFromPoints(points, ox, originMaxY, isClosed)
      return d ? `<path d="${d}" ${sw} stroke-linecap="round" stroke-linejoin="round"/>` : ''
    }
    default:
      return ''
  }
}
