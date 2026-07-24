import type { Point } from '../types/geometry'

/**
 * Makes a short random ID for temporary UI list items.
 */
export function uid(): string {
  return Math.random().toString(36).slice(2, 9)
}

/**
 * Turns a raw byte number into a readable string like "1.4 MB".
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Converts a millimetre width to a "X.XX m" string for the status bar.
 */
export function formatWidthMeters(mm: number): string {
  if (!Number.isFinite(mm) || mm <= 0) return 'n/a'
  return `${(mm / 1000).toFixed(2)} m`
}

/**
 * Rounds a coordinate to 4 decimal places before any comparison or export.
 */
export function roundCoord(value: number | string): number {
  return Math.round((Number(value) + Number.EPSILON) * 1e4) / 1e4
}

/**
 * Strips the ".dxf" extension so the filename can be used as a part label.
 */
export function partLabelFromName(name: string | null | undefined): string {
  return String(name || '')
    .replace(/\.dxf$/i, '')
    .trim()
}

/**
 * Parses the "rotation step" dropdown value into a usable number.
 */
export function normalizeRotationStep(value: string | number): number | null {
  if (value === 'none') return null
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}

/**
 * Builds the full list of allowed angles from a single step value.
 */
export function buildAllowedOrientations(rotationStepValue: string | number): number[] {
  const step = normalizeRotationStep(rotationStepValue)
  if (!step) return [0]

  const orientations: number[] = []
  for (let angle = 0; angle < 360; angle += step) {
    orientations.push(angle)
  }

  if (!orientations.length) return [0]
  return [...new Set(orientations.map((angle) => roundCoord(angle)))]
}

/**
 * Checks whether two polygon points are the same after rounding.
 */
export function sameExportPoint(a: Point | null | undefined, b: Point | null | undefined): boolean {
  return !!a && !!b && roundCoord(a.x) === roundCoord(b.x) && roundCoord(a.y) === roundCoord(b.y)
}

/**
 * Cleans up a raw polygon ring before it goes to the solver or export.
 */
export function sanitizePolygonPoints(points: unknown[]): Point[] {
  if (!Array.isArray(points) || !points.length) return []

  const normalized = (points as Point[])
    .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({ x: roundCoord(point.x), y: roundCoord(point.y) }))

  const dedupedConsecutive: Point[] = []
  normalized.forEach((point) => {
    if (
      !dedupedConsecutive.length ||
      !sameExportPoint(dedupedConsecutive[dedupedConsecutive.length - 1], point)
    ) {
      dedupedConsecutive.push(point)
    }
  })

  if (dedupedConsecutive.length < 3) return []

  const isClosed = sameExportPoint(
    dedupedConsecutive[0],
    dedupedConsecutive[dedupedConsecutive.length - 1]
  )
  const openRing = isClosed ? dedupedConsecutive.slice(0, -1) : [...dedupedConsecutive]

  const seen = new Set<string>()
  const uniqueRing: Point[] = []
  openRing.forEach((point) => {
    const key = `${point.x},${point.y}`
    if (seen.has(key)) return
    seen.add(key)
    uniqueRing.push(point)
  })

  if (uniqueRing.length < 3) return []

  uniqueRing.push({ ...uniqueRing[0] })
  return uniqueRing
}

/**
 * Deep-clones any plain JSON-serialisable value.
 */
export function clonePlain<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

/**
 * Figures out how many copies of a part the solver should actually cut.
 */
export function effectiveFileQty(
  file:
    | { qty?: string | number; shapes?: { visible?: boolean; qty?: string | number }[] }
    | null
    | undefined
): number {
  if (Array.isArray(file?.shapes) && file!.shapes.length) {
    const visibleTotal = file!.shapes
      .filter((shape) => shape.visible !== false)
      .reduce((sum, shape) => sum + Math.max(1, parseInt(String(shape.qty || 1), 10)), 0)
    return Math.max(1, visibleTotal || 0)
  }
  return Math.max(1, parseInt(String(file?.qty || 1), 10))
}

/**
 * Creates a human-readable name for a nesting job.
 */
export function buildJobName(
  files: { name?: string }[] | null | undefined,
  now = new Date()
): string {
  if (Array.isArray(files) && files.length === 1 && files[0]?.name) {
    return partLabelFromName(files[0].name)
  }

  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ].join('')

  return `nesting-job-${stamp}`
}
