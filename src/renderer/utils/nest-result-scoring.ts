export interface NestSummaryScore {
  totalItemCount: number
  stripCount: number
  lastStripWidth: number
  lastDensity: number
  bodyScore: number
}

export function effectiveStripDensity(
  strip: Record<string, unknown>,
  sheet: Record<string, unknown> = {}
): number {
  const rawDensity = Number(strip?.density)
  if (!Number.isFinite(rawDensity) || rawDensity <= 0) return 0
  if (sheet?.widthMode !== 'fixed') return rawDensity

  const rawWidth = Number(strip?.strip_width)
  const rawHeight = Number(strip?.strip_height) || Number(sheet?.height)
  const configuredWidth = Number(sheet?.width)
  if (
    !Number.isFinite(rawWidth) ||
    rawWidth <= 0 ||
    !Number.isFinite(rawHeight) ||
    rawHeight <= 0 ||
    !Number.isFinite(configuredWidth) ||
    configuredWidth <= 0
  ) {
    return rawDensity
  }

  const usedArea = rawDensity * rawWidth * rawHeight
  const fixedArea = configuredWidth * rawHeight
  if (!Number.isFinite(fixedArea) || fixedArea <= 0) return rawDensity
  return usedArea / fixedArea
}

export function scoreNestSummary(
  summary: Record<string, unknown>,
  sheet: Record<string, unknown> = {}
): NestSummaryScore {
  const strips = Array.isArray(summary?.strips) ? summary.strips : []
  if (!strips.length) {
    return {
      totalItemCount: 0,
      stripCount: Infinity,
      lastStripWidth: Infinity,
      lastDensity: 0,
      bodyScore: 0
    }
  }

  const totalItemCount = strips.reduce(
    (sum: number, strip: Record<string, unknown>) => sum + (Number(strip?.item_count) || 0),
    0
  )
  const stripCount = strips.length
  const lastStrip = strips[strips.length - 1]
  const lastStripWidth = Number(lastStrip?.strip_width) || Infinity
  const lastDensity = effectiveStripDensity(lastStrip, sheet)

  let bodyScore = 0
  if (strips.length > 1) {
    const bodyStrips = strips.slice(0, -1)
    bodyScore = bodyStrips.reduce((sum: number, strip: Record<string, unknown>) => {
      const density = effectiveStripDensity(strip, sheet)
      return sum + Math.pow(density, 2)
    }, 0)
  }

  return {
    totalItemCount,
    stripCount,
    lastStripWidth,
    lastDensity,
    bodyScore
  }
}

export function isNestSummaryBetter(
  candidateScore: NestSummaryScore,
  currentScore: NestSummaryScore | null
): boolean {
  if (!currentScore) return true

  const EPSILON = 0.0001

  if (candidateScore.totalItemCount > currentScore.totalItemCount) return true
  if (candidateScore.totalItemCount < currentScore.totalItemCount) return false

  if (candidateScore.stripCount < currentScore.stripCount) return true
  if (candidateScore.stripCount > currentScore.stripCount) return false

  if (currentScore.lastStripWidth - candidateScore.lastStripWidth > EPSILON) return true
  if (candidateScore.lastStripWidth - currentScore.lastStripWidth > EPSILON) return false

  if (candidateScore.bodyScore - currentScore.bodyScore > EPSILON) return true
  if (currentScore.bodyScore - candidateScore.bodyScore > EPSILON) return false

  if (candidateScore.lastDensity - currentScore.lastDensity > EPSILON) return true

  return false
}
