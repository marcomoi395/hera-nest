import { app } from 'electron'

export function isMasBuild(): boolean {
  return !!process.mas
}

export function normalizeBookmark(bookmark: string | null | undefined): string | null {
  return typeof bookmark === 'string' && bookmark.trim() ? bookmark : null
}

export function startBookmarkAccess(bookmark: string | null): (() => void) | null {
  const normalized = normalizeBookmark(bookmark)
  if (
    !isMasBuild() ||
    !normalized ||
    typeof app.startAccessingSecurityScopedResource !== 'function'
  ) {
    return () => {}
  }

  const stopAccess = app.startAccessingSecurityScopedResource(normalized)
  return typeof stopAccess === 'function' ? (stopAccess as () => void) : () => {}
}

export async function withSecurityScopedAccess<T>(
  bookmark: string | null,
  work: () => Promise<T> | T
): Promise<T> {
  const stopAccess = startBookmarkAccess(bookmark)
  try {
    return await work()
  } finally {
    try {
      stopAccess?.()
    } catch {
      // Ignore cleanup errors so the original file-operation error can surface.
    }
  }
}
