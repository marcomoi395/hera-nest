import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { Point } from '../../types/geometry'

interface Transformation {
  rotation?: number
  translation?: [number, number]
}

interface Placement {
  item_id: string
  transformation?: Transformation
}

interface Item {
  id: string
  shape?: {
    data?: unknown[]
  }
}

interface StripData {
  solution?: {
    layout?: {
      placed_items?: Placement[]
    }
  }
  items?: Item[]
}

interface Strip {
  json_path?: string
  svg_path?: string
  svg?: string
  strip_width?: number | null
  strip_height?: number | null
  density?: number | null
  item_count?: number
  placed_item_counts?: Array<{ item_id: number; count: number }>
  placed_item_ids?: number[]
  is_preview?: boolean
}

interface Summary {
  name?: string
  strip_count?: number
  density?: number | null
  is_preview?: boolean
  strips?: Strip[]
}

function roundCoord(value: number): number {
  return Number(value.toFixed(6))
}

function transformPoint(
  point: unknown,
  rotationDeg: number,
  translation: unknown
): Point | null {
  const [tx, ty] = Array.isArray(translation) ? translation : [0, 0]
  const radians = (Number(rotationDeg) || 0) * (Math.PI / 180)
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const x = Number((point as any)?.[0])
  const y = Number((point as any)?.[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    x: x * cos - y * sin + tx,
    y: x * sin + y * cos + ty
  }
}

function polygonMinX(item: Item | undefined, placement: Placement): number {
  const points = Array.isArray(item?.shape?.data) ? item.shape.data : []
  if (!points.length) return Infinity
  const rotation = Number(placement?.transformation?.rotation) || 0
  const translation = placement?.transformation?.translation
  let minX = Infinity
  for (const point of points) {
    const transformed = transformPoint(point, rotation, translation)
    if (!transformed) continue
    if (transformed.x < minX) minX = transformed.x
  }
  return minX
}

function shiftSvgText(svgText: string, shiftX: number): string {
  return String(svgText || '').replace(
    /translate\(\s*([\-\d.]+)(?:[\s,]+([\-\d.]+))\s*\)/g,
    (match, xRaw, yRaw) => {
      const x = Number(xRaw)
      const y = Number(yRaw)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return match
      return `translate(${roundCoord(x + shiftX)} ${roundCoord(y)})`
    }
  )
}

export function compactLastStripArtifacts(summary: Summary): Summary {
  const strips = Array.isArray(summary?.strips) ? summary.strips : []
  if (!strips.length) return summary

  const lastIndex = strips.length - 1
  const lastStrip = strips[lastIndex]
  if (!lastStrip?.json_path || !existsSync(lastStrip.json_path)) return summary

  let stripData: StripData
  try {
    stripData = JSON.parse(readFileSync(lastStrip.json_path, 'utf8'))
  } catch {
    return summary
  }

  const placedItems = Array.isArray(stripData?.solution?.layout?.placed_items)
    ? stripData.solution.layout.placed_items
    : []
  const items = Array.isArray(stripData?.items) ? stripData.items : []
  if (!placedItems.length || !items.length) return summary

  const itemsById = new Map(items.map((item) => [item.id, item]))
  const minX = placedItems.reduce((acc, placement) => {
    const item = itemsById.get(placement?.item_id)
    return Math.min(acc, polygonMinX(item, placement))
  }, Infinity)
  if (!Number.isFinite(minX) || minX <= 1e-6) return summary

  const shiftX = -minX
  placedItems.forEach((placement) => {
    const translation = placement?.transformation?.translation
    if (!Array.isArray(translation) || translation.length < 2) return
    const nextX = Number(translation[0])
    const nextY = Number(translation[1])
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return
    placement.transformation!.translation = [roundCoord(nextX + shiftX), roundCoord(nextY)]
  })
  writeFileSync(lastStrip.json_path, `${JSON.stringify(stripData, null, 2)}\n`)

  let nextSvg = lastStrip.svg || ''
  if (lastStrip.svg_path && existsSync(lastStrip.svg_path)) {
    nextSvg = shiftSvgText(readFileSync(lastStrip.svg_path, 'utf8'), shiftX)
    writeFileSync(lastStrip.svg_path, nextSvg)
  }

  const nextStrips = strips.slice()
  nextStrips[lastIndex] = {
    ...lastStrip,
    svg: nextSvg
  }
  return {
    ...summary,
    strips: nextStrips
  }
}
