import { effectiveStripDensity } from './nest-result-scoring'

export interface ItemCount {
  item_id: number
  count: number
}

export interface TailRefinementCandidate {
  id: string
  label: string
  replaceStartIndex: number
  maxReplacementStrips: number
  itemCounts: ItemCount[]
  sourceStripCount: number
}

export interface TailRefinementScore {
  stripCount: number
  preferShortLastStrip: boolean
  lastDensity: number
  lastStripWidth: number
  totalItemCount: number
}

export function itemCountsToMap(counts: any[] | null | undefined): Map<number, number> {
  const map = new Map<number, number>()
  ;(Array.isArray(counts) ? counts : []).forEach((entry) => {
    const itemId = Number(entry?.item_id)
    const count = Math.trunc(Number(entry?.count))
    if (!Number.isFinite(itemId) || count <= 0) return
    map.set(itemId, count)
  })
  return map
}

function mapToSortedCounts(map: Map<number, number>): ItemCount[] {
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([item_id, count]) => ({ item_id, count }))
}

function hasUsablePlacedItemCounts(strip: any): boolean {
  return itemCountsToMap(strip?.placed_item_counts).size > 0
}

function combineTailCounts(strips: any[]): ItemCount[] {
  const combined = new Map<number, number>()
  strips.forEach((strip) => {
    itemCountsToMap(strip?.placed_item_counts).forEach((count, itemId) => {
      combined.set(itemId, (combined.get(itemId) || 0) + count)
    })
  })
  return mapToSortedCounts(combined)
}

export function shouldSkipTailRefinement(summary: any, sheet: any): boolean {
  const strips = Array.isArray(summary?.strips) ? summary.strips : []
  if (!strips.length) return true
  if (sheet?.widthMode === 'unlimited') return true
  if (strips.length <= 1) return true
  return false
}

export function buildTailRefinementCandidates(
  summary: any,
  payload: any,
  options: any = {}
): TailRefinementCandidate[] {
  void payload
  void options
  const strips = Array.isArray(summary?.strips) ? summary.strips : []
  if (strips.length < 1) return []
  const lastStrip = strips[strips.length - 1]
  if (!hasUsablePlacedItemCounts(lastStrip)) return []

  return [
    {
      id: 'last-only',
      label: 'last sheet',
      replaceStartIndex: strips.length - 1,
      maxReplacementStrips: 1,
      itemCounts: combineTailCounts([lastStrip]),
      sourceStripCount: 1
    }
  ]
}

export function buildTailSubsetPayload(payload: any, candidate: TailRefinementCandidate): any {
  const itemCounts = itemCountsToMap(candidate?.itemCounts)
  const baseName = payload?.name || 'nesting-job'
  const filteredItems = (Array.isArray(payload?.items) ? payload.items : []).filter((item) =>
    itemCounts.has(Number(item?.id))
  )
  const idMapping: Record<number, number> = {}
  const remappedItems = filteredItems.map((item, index) => {
    idMapping[index] = Number(item.id)
    return { ...item, id: index, demand: itemCounts.get(Number(item.id)) }
  })
  return {
    ...payload,
    name: `${baseName}_tail_${candidate?.id}`,
    items: remappedItems,
    _tailIdMapping: idMapping
  }
}

export function mergeTailReplacement(
  baseSummary: any,
  replacementSummary: any,
  candidate: TailRefinementCandidate
): any {
  const baseStrips = Array.isArray(baseSummary?.strips) ? baseSummary.strips : []
  const replacementStrips = Array.isArray(replacementSummary?.strips)
    ? replacementSummary.strips
    : []
  if (
    replacementStrips.length < 1 ||
    replacementStrips.length > Number(candidate?.maxReplacementStrips)
  )
    return null
  const mergedStrips = [
    ...baseStrips.slice(0, Number(candidate?.replaceStartIndex) || 0),
    ...replacementStrips.map((strip, offset) => ({
      ...strip,
      index: (Number(candidate?.replaceStartIndex) || 0) + offset + 1
    }))
  ]
  return {
    ...baseSummary,
    strips: mergedStrips,
    strip_count: mergedStrips.length,
    is_preview: false
  }
}

export function scoreTailRefinementSummary(summary: any, sheet: any): TailRefinementScore {
  const strips = Array.isArray(summary?.strips) ? summary.strips : []
  if (!strips.length) {
    return {
      stripCount: Infinity,
      preferShortLastStrip: sheet?.widthMode === 'fixed' || sheet?.widthMode === 'max',
      lastDensity: 0,
      lastStripWidth: Infinity,
      totalItemCount: 0
    }
  }

  const lastStrip = strips[strips.length - 1] || {}
  const lastDensity = effectiveStripDensity(lastStrip, sheet)
  const lastStripWidth = Number(lastStrip.strip_width) || Infinity
  const totalItemCount = strips.reduce(
    (sum: number, strip: any) => sum + (Number(strip?.item_count) || 0),
    0
  )

  return {
    stripCount: strips.length,
    preferShortLastStrip: sheet?.widthMode === 'fixed' || sheet?.widthMode === 'max',
    lastDensity,
    lastStripWidth,
    totalItemCount
  }
}

export function isTailRefinementBetter(
  candidateScore: TailRefinementScore | null,
  currentScore: TailRefinementScore | null
): boolean {
  if (!currentScore) return true
  if (!candidateScore) return false
  const tolerance = 1e-9

  if ((candidateScore.totalItemCount ?? 0) > (currentScore.totalItemCount ?? 0)) return true
  if ((candidateScore.totalItemCount ?? 0) < (currentScore.totalItemCount ?? 0)) return false

  if ((candidateScore.stripCount ?? Infinity) !== (currentScore.stripCount ?? Infinity)) {
    return (candidateScore.stripCount ?? Infinity) < (currentScore.stripCount ?? Infinity)
  }

  if (candidateScore.preferShortLastStrip || currentScore.preferShortLastStrip) {
    if (
      (currentScore.lastStripWidth ?? Infinity) - (candidateScore.lastStripWidth ?? Infinity) >
      tolerance
    )
      return true
    if (
      (candidateScore.lastStripWidth ?? Infinity) - (currentScore.lastStripWidth ?? Infinity) >
      tolerance
    )
      return false
    if ((candidateScore.lastDensity ?? 0) - (currentScore.lastDensity ?? 0) > tolerance) return true
    if ((currentScore.lastDensity ?? 0) - (candidateScore.lastDensity ?? 0) > tolerance)
      return false
    return false
  }
  if ((candidateScore.lastDensity ?? 0) - (currentScore.lastDensity ?? 0) > tolerance) return true
  if ((currentScore.lastDensity ?? 0) - (candidateScore.lastDensity ?? 0) > tolerance) return false
  if (
    (currentScore.lastStripWidth ?? Infinity) - (candidateScore.lastStripWidth ?? Infinity) >
    tolerance
  )
    return true
  if (
    (candidateScore.lastStripWidth ?? Infinity) - (currentScore.lastStripWidth ?? Infinity) >
    tolerance
  )
    return false
  return false
}
