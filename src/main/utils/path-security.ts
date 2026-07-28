import path from 'node:path'

/**
 * Ensures that a given relative path resolves within a base directory.
 * Prevents path traversal attacks by validating that the resolved path
 * is contained within the expected base directory.
 *
 * @param baseDir - The base directory that should contain the resolved path
 * @param relativePath - The relative path to validate (e.g., from user input or external data)
 * @returns The fully resolved safe path if validation passes
 * @throws Error if path traversal is detected or path is invalid
 *
 * @example
 * ```typescript
 * // Safe paths - these will succeed
 * ensurePathContained('/safe/dir', 'file.txt')           // -> '/safe/dir/file.txt'
 * ensurePathContained('/safe/dir', 'subdir/file.txt')    // -> '/safe/dir/subdir/file.txt'
 * ensurePathContained('/safe/dir', './file.txt')         // -> '/safe/dir/file.txt'
 *
 * // Dangerous paths - these will throw
 * ensurePathContained('/safe/dir', '../etc/passwd')      // throws: Path traversal detected
 * ensurePathContained('/safe/dir', '/etc/passwd')        // throws: Path traversal detected
 * ensurePathContained('/safe/dir', 'file\x00.txt')       // throws: Invalid path
 * ```
 */
export function ensurePathContained(baseDir: string, relativePath: string): string {
  // Validate input: reject empty, whitespace-only, or null-byte paths
  const trimmed = relativePath.trim()
  if (!trimmed) {
    throw new Error('Invalid path: path cannot be empty or whitespace-only')
  }

  if (relativePath.includes('\x00')) {
    throw new Error('Invalid path: null bytes are not allowed')
  }

  // Resolve both paths to absolute normalized forms
  const resolvedBase = path.resolve(baseDir)
  const resolvedPath = path.resolve(baseDir, relativePath)

  // Check if resolved path starts with the base directory
  // Use path.relative to ensure we're checking containment correctly across platforms
  const relative = path.relative(resolvedBase, resolvedPath)

  // If relative path starts with '..' or is absolute, it's outside the base directory
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `Path traversal detected: "${relativePath}" resolves outside base directory "${baseDir}"`
    )
  }

  return resolvedPath
}
