import { aciToHex, normalizeHexColor, normalizeAci, trueColorToHex } from '../utils/dxf-color'

export const FALLBACK_PALETTE = [
  '#4f8ef7',
  '#f75f5f',
  '#4fcf8e',
  '#f7c34f',
  '#cf4ff7',
  '#4ff7e8',
  '#f77f4f'
]

export function createLayerResolver(layerTable: Record<string, Record<string, unknown>>): {
  layerColor: (name: string | null | undefined) => string
  resolveEntityColor: (entity: Record<string, unknown> | null, fallbackLayer?: string) => string
  findLayerDef: (name: string | null | undefined) => Record<string, unknown> | null
  resolveLayerDefColor: (def: Record<string, unknown> | null) => string | null
} {
  let paletteIndex = 0
  const colorCache: Record<string, string> = {}

  function findLayerDef(name: string | null | undefined): Record<string, unknown> | null {
    const key = String(name || '')
    if (layerTable[key]) return layerTable[key]
    const trimmed = key.trim()
    if (trimmed && layerTable[trimmed]) return layerTable[trimmed]
    const matchKey = Object.keys(layerTable).find((k) => k.trim() === trimmed)
    return matchKey ? layerTable[matchKey] : null
  }

  function resolveLayerDefColor(def: Record<string, unknown> | null): string | null {
    if (!def) return null
    const explicitHex =
      normalizeHexColor(def.color) || normalizeHexColor(def.trueColor) || normalizeHexColor(def.rgb)
    if (explicitHex) return explicitHex
    const trueColor = trueColorToHex(def.trueColor ?? def.color24 ?? def.rgb24)
    if (trueColor) return trueColor
    const aci = normalizeAci(
      def.colorNumber ?? def.colorIndex ?? def.aciColor ?? def.color ?? def.aci
    )
    if (aci !== null) {
      const mapped = aciToHex(aci)
      if (mapped) return mapped
    }
    return null
  }

  function layerColor(name: string | null | undefined): string {
    const key = String(name || '')
    if (colorCache[key]) return colorCache[key]
    const def = findLayerDef(key)
    colorCache[key] =
      resolveLayerDefColor(def) || FALLBACK_PALETTE[paletteIndex++ % FALLBACK_PALETTE.length]
    return colorCache[key]
  }

  function resolveEntityColor(entity: Record<string, unknown> | null, fallbackLayer = '0'): string {
    if (!entity) return layerColor(fallbackLayer)
    const explicitHex = normalizeHexColor(entity.color) || normalizeHexColor(entity.trueColor)
    if (explicitHex) return explicitHex
    const trueColor = trueColorToHex(entity.rawTrueColor ?? entity.trueColor ?? entity.color24)
    if (trueColor) return trueColor
    const aci = normalizeAci(
      entity.rawAciColor ?? entity.colorNumber ?? entity.colorIndex ?? entity.color
    )
    if (aci !== null) {
      if (aci === 256 || aci === 0)
        return layerColor((entity.layer as string | undefined) || fallbackLayer)
      const mapped = aciToHex(aci)
      if (mapped) return mapped
    }
    return layerColor((entity.layer as string | undefined) || fallbackLayer)
  }

  return {
    layerColor,
    resolveEntityColor,
    findLayerDef,
    resolveLayerDefColor
  }
}
