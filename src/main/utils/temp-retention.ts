import { existsSync, readdirSync, statSync, rmSync } from 'fs'
import path from 'path'

export const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function cleanupTempArtifacts(rootDir: string, maxAgeMs: number = ONE_DAY_MS): void {
  if (!rootDir) return
  if (!existsSync(rootDir)) return

  const cutoff = Date.now() - maxAgeMs
  const entries = readdirSync(rootDir, { withFileTypes: true })

  entries.forEach((entry) => {
    const entryPath = path.join(rootDir, entry.name)
    try {
      const stats = statSync(entryPath)
      const modifiedAt = stats.mtimeMs || stats.ctimeMs || 0
      if (modifiedAt >= cutoff) return
      rmSync(entryPath, { recursive: true, force: true })
    } catch {
      // Best-effort cleanup only. Ignore files currently locked or already removed.
    }
  })
}
