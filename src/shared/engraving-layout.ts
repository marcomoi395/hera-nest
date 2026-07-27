import type { Point } from '../types/geometry-types'

interface EngravingLayoutConfig {
  minCharHeight: number
  maxCharHeight: number
  charWidthRatio: number
  charAdvance: number
  minClearance: number
  clearanceScale: number
  gridDivisions: number
}

interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface LayoutResult {
  text: string
  chars: string[]
  charH: number
  charW: number
  totalW: number
  totalH: number
  startX: number
  baseY: number
  center: Point
  clearance: number
  bbox: BBox
  outerArea: number
}
export const DEFAULT_LAYOUT: EngravingLayoutConfig = {
  minCharHeight: 6,
  maxCharHeight: 20,
  charWidthRatio: 0.7,
  charAdvance: 1.25,
  minClearance: 1.5,
  clearanceScale: 0.22,
  gridDivisions: 7
}

function asPoint(point: unknown): Point | null {
  if (Array.isArray(point) && point.length >= 2) {
    const x = Number(point[0])
    const y = Number(point[1])
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
  }
  const p = point as { x?: unknown; y?: unknown }
  const x = Number(p?.x)
  const y = Number(p?.y)
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

function samePoint(a: Point | null, b: Point | null, eps = 1e-6): boolean {
  return !!a && !!b && Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps
}

function normalizePolygon(points: unknown): Point[] {
  if (!Array.isArray(points)) return []
  const normalized = points.map(asPoint).filter((p): p is Point => p !== null)
  if (normalized.length > 2 && samePoint(normalized[0], normalized[normalized.length - 1])) {
    normalized.pop()
  }
  return normalized
}

export function sanitizeLabelText(text: string): string {
  return String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 _-]/g, ' ')
    .trim()
}

function bboxFromPoints(points: Point[]): BBox | null {
  if (!Array.isArray(points) || !points.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  points.forEach((point) => {
    if (!point) return
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  })
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null
}

function polygonSignedArea(points: Point[]): number {
  if (!Array.isArray(points) || points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}

function pointOnSegment(point: Point, a: Point, b: Point, eps = 1e-6): boolean {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y)
  if (Math.abs(cross) > eps) return false
  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)
  if (dot < -eps) return false
  const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
  return dot <= lenSq + eps
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (pointOnSegment(point, a, b)) return true
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-12) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

function rectContainsPoint(rect: Rect, point: Point, eps = 1e-6): boolean {
  return (
    point.x >= rect.x - eps &&
    point.x <= rect.x + rect.w + eps &&
    point.y >= rect.y - eps &&
    point.y <= rect.y + rect.h + eps
  )
}

function rectPoints(rect: Rect): Point[] {
  const left = rect.x
  const right = rect.x + rect.w
  const top = rect.y
  const bottom = rect.y + rect.h
  const midX = (left + right) / 2
  const midY = (top + bottom) / 2
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: midX, y: top },
    { x: right, y: midY },
    { x: midX, y: bottom },
    { x: left, y: midY },
    { x: midX, y: midY },
    { x: (left + midX) / 2, y: (top + midY) / 2 },
    { x: (midX + right) / 2, y: (top + midY) / 2 },
    { x: (left + midX) / 2, y: (midY + bottom) / 2 },
    { x: (midX + right) / 2, y: (midY + bottom) / 2 }
  ]
}

function polygonEdges(points: Point[]): [Point, Point][] {
  const edges: [Point, Point][] = []
  for (let i = 0; i < points.length; i++) {
    edges.push([points[i], points[(i + 1) % points.length]])
  }
  return edges
}

function orientation(a: Point, b: Point, c: Point, eps = 1e-6): number {
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  if (Math.abs(cross) <= eps) return 0
  return cross > 0 ? 1 : -1
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)

  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && pointOnSegment(c, a, b)) return true
  if (o2 === 0 && pointOnSegment(d, a, b)) return true
  if (o3 === 0 && pointOnSegment(a, c, d)) return true
  if (o4 === 0 && pointOnSegment(b, c, d)) return true
  return false
}

function rectEdges(rect: Rect): [Point, Point][] {
  const points = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h }
  ]
  return polygonEdges(points)
}

function rectFitsRegion(rect: Rect, outerPolygon: Point[], holePolygons: Point[][]): boolean {
  if (!rect || rect.w <= 0 || rect.h <= 0) return false
  const samples = rectPoints(rect)
  if (samples.some((point) => !pointInPolygon(point, outerPolygon))) return false
  if (holePolygons.some((hole) => samples.some((point) => pointInPolygon(point, hole))))
    return false

  const safeEdges = rectEdges(rect)
  const outerEdges = polygonEdges(outerPolygon)
  if (outerEdges.some(([a, b]) => safeEdges.some(([c, d]) => segmentsIntersect(a, b, c, d))))
    return false
  if (
    holePolygons.some((hole) =>
      polygonEdges(hole).some(([a, b]) => safeEdges.some(([c, d]) => segmentsIntersect(a, b, c, d)))
    )
  )
    return false

  if (outerPolygon.some((point) => rectContainsPoint(rect, point))) return false
  if (holePolygons.some((hole) => hole.some((point) => rectContainsPoint(rect, point))))
    return false
  return true
}

function buildCandidateCenters(bbox: BBox, divisions = DEFAULT_LAYOUT.gridDivisions): Point[] {
  const centerX = (bbox.minX + bbox.maxX) / 2
  const centerY = (bbox.minY + bbox.maxY) / 2
  const ratios: number[] = []
  for (let i = 0; i < divisions; i++) {
    ratios.push(divisions === 1 ? 0.5 : i / (divisions - 1))
  }
  const points: Point[] = [{ x: centerX, y: centerY }]
  ratios.forEach((yRatio) => {
    ratios.forEach((xRatio) => {
      points.push({
        x: bbox.minX + (bbox.maxX - bbox.minX) * xRatio,
        y: bbox.minY + (bbox.maxY - bbox.minY) * yRatio
      })
    })
  })
  const deduped: Point[] = []
  points.forEach((point) => {
    if (!deduped.some((existing) => samePoint(existing, point, 1e-4))) deduped.push(point)
  })
  deduped.sort((a, b) => {
    const da = (a.x - centerX) ** 2 + (a.y - centerY) ** 2
    const db = (b.x - centerX) ** 2 + (b.y - centerY) ** 2
    return da - db
  })
  return deduped
}

export function layoutEngravingLabel(
  options: {
    text?: string
    outerPolygon?: unknown
    holes?: unknown[]
  } & Partial<EngravingLayoutConfig> = {}
): LayoutResult | null {
  const config = { ...DEFAULT_LAYOUT, ...(options || {}) }
  const text = sanitizeLabelText(options.text || '')
  if (!text) return null

  const outerPolygon = normalizePolygon(options.outerPolygon)
  if (outerPolygon.length < 3) return null
  const holePolygons = (options.holes || [])
    .map(normalizePolygon)
    .filter((points) => points.length >= 3)
  const bbox = bboxFromPoints(outerPolygon)
  if (!bbox) return null

  const glyphCount = text.length
  const textUnitsWide = Math.max(1, glyphCount * config.charAdvance - 0.25)
  const availableW = Math.max(0, bbox.maxX - bbox.minX)
  const availableH = Math.max(0, bbox.maxY - bbox.minY)
  const naturalMaxCharH = Math.min(
    config.maxCharHeight,
    availableH * 0.22,
    availableW / textUnitsWide
  )
  if (!Number.isFinite(naturalMaxCharH) || naturalMaxCharH < config.minCharHeight) return null

  const candidateCenters = buildCandidateCenters(bbox, config.gridDivisions)

  for (let charH = naturalMaxCharH; charH >= config.minCharHeight; charH *= 0.88) {
    const charW = charH * config.charWidthRatio
    const totalW = glyphCount * charW * config.charAdvance - charW * 0.25
    const totalH = charH
    const clearance = Math.max(config.minClearance, charH * config.clearanceScale)

    for (const center of candidateCenters) {
      const safeRect = {
        x: center.x - totalW / 2 - clearance,
        y: center.y - totalH / 2 - clearance,
        w: totalW + clearance * 2,
        h: totalH + clearance * 2
      }
      if (!rectFitsRegion(safeRect, outerPolygon, holePolygons)) continue

      const startX = center.x - totalW / 2
      const baseY = center.y - totalH / 2
      return {
        text,
        chars: [...text],
        charH,
        charW,
        totalW,
        totalH,
        startX,
        baseY,
        center,
        clearance,
        bbox,
        outerArea: Math.abs(polygonSignedArea(outerPolygon))
      }
    }
  }

  return null
}

const CONTENT_SLICE_STYLES: Record<string, { side: 'first' | 'last'; count: number }> = {
  'last-char': { side: 'last', count: 1 },
  'last-two-chars': { side: 'last', count: 2 },
  'last-three-chars': { side: 'last', count: 3 },
  'first-char': { side: 'first', count: 1 },
  'first-two-chars': { side: 'first', count: 2 },
  'first-three-chars': { side: 'first', count: 3 }
}

/**
 * Resolves the actual text that should be engraved for a given part label,
 * based on the user-selected engraving style.
 */
export function engravingLabelText(text: string, style: string): string {
  const str = String(text || '')
  const sliceStyle = CONTENT_SLICE_STYLES[style]
  if (!sliceStyle) return str
  const match =
    sliceStyle.side === 'first'
      ? str.match(/^[^a-z0-9]*([a-z0-9]+)/i)
      : str.match(/([a-z0-9]+)[^a-z0-9]*$/i)
  if (!match) return str
  return sliceStyle.side === 'first'
    ? match[1].slice(0, sliceStyle.count)
    : match[1].slice(-sliceStyle.count)
}

/**
 * Maps an engraving style to the visual style key used by the renderer.
 */
export function engravingVisualStyle(style: string): 'simple' | 'stroked' {
  return style === 'stroked' ? 'stroked' : 'simple'
}
