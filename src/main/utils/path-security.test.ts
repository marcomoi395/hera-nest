import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { ensurePathContained } from './path-security'

describe('ensurePathContained', () => {
  const baseDir = '/safe/working/directory'

  it('should allow valid relative paths within base directory', () => {
    expect(() => {
      ensurePathContained(baseDir, 'file.txt')
    }).not.toThrow()

    expect(() => {
      ensurePathContained(baseDir, 'subdir/file.txt')
    }).not.toThrow()

    expect(() => {
      ensurePathContained(baseDir, './file.txt')
    }).not.toThrow()
  })

  it('should reject path traversal attempts using ../', () => {
    expect(() => {
      ensurePathContained(baseDir, '../etc/passwd')
    }).toThrow(/Path traversal detected/)

    expect(() => {
      ensurePathContained(baseDir, '../../etc/passwd')
    }).toThrow(/Path traversal detected/)

    expect(() => {
      ensurePathContained(baseDir, 'subdir/../../etc/passwd')
    }).toThrow(/Path traversal detected/)
  })

  it('should reject absolute paths outside base directory', () => {
    expect(() => {
      ensurePathContained(baseDir, '/etc/passwd')
    }).toThrow(/Path traversal detected/)

    expect(() => {
      ensurePathContained(baseDir, '/tmp/malicious.txt')
    }).toThrow(/Path traversal detected/)
  })

  it('should allow absolute paths that resolve within base directory', () => {
    const safePath = path.join(baseDir, 'file.txt')
    expect(() => {
      ensurePathContained(baseDir, safePath)
    }).not.toThrow()
  })

  it('should normalize paths before validation', () => {
    expect(() => {
      ensurePathContained(baseDir, 'subdir/../file.txt')
    }).not.toThrow()

    expect(() => {
      ensurePathContained(baseDir, './subdir/./file.txt')
    }).not.toThrow()
  })

  it('should reject symbolic link path components that escape (path string check)', () => {
    // Note: This tests string-based path traversal prevention
    // Actual symlink following would require filesystem operations
    expect(() => {
      ensurePathContained(baseDir, '../../../etc/passwd')
    }).toThrow(/Path traversal detected/)
  })

  it('should reject empty or whitespace-only relative paths', () => {
    expect(() => {
      ensurePathContained(baseDir, '')
    }).toThrow(/Invalid path/)

    expect(() => {
      ensurePathContained(baseDir, '   ')
    }).toThrow(/Invalid path/)
  })

  it('should reject paths with null bytes', () => {
    expect(() => {
      ensurePathContained(baseDir, 'file\x00.txt')
    }).toThrow(/Invalid path/)
  })

  it('should handle Windows-style paths on Windows', () => {
    if (process.platform === 'win32') {
      expect(() => {
        ensurePathContained('C:\\safe\\dir', 'file.txt')
      }).not.toThrow()

      expect(() => {
        ensurePathContained('C:\\safe\\dir', '..\\..\\Windows\\System32')
      }).toThrow(/Path traversal detected/)
    }
  })

  it('should return the resolved safe path on success', () => {
    const result = ensurePathContained(baseDir, 'file.txt')
    expect(result).toBe(path.join(baseDir, 'file.txt'))

    const result2 = ensurePathContained(baseDir, 'subdir/file.txt')
    expect(result2).toBe(path.join(baseDir, 'subdir', 'file.txt'))
  })
})
