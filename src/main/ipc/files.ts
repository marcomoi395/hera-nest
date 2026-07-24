import { app, dialog, ipcMain, shell, BrowserWindow, IpcMainEvent } from 'electron'
import path from 'path'
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'fs'
import toPlanarGraphLib from 'to-planar-graph'
import planarFaceDiscoveryLib from 'planar-face-discovery'
import DxfParser from 'dxf-parser'
import { cleanupTempArtifacts } from '../utils/temp-retention'
import {
  isMasBuild,
  normalizeBookmark,
  withSecurityScopedAccess
} from '../utils/security-scoped-bookmarks'
import type { ParseResult, SaveResult, FileDialogResult } from '../../types/electron-api'

interface RegisterFileIpcDeps {
  getMainWindow: () => BrowserWindow | null
}

export function registerFileIpc({ getMainWindow }: RegisterFileIpcDeps): void {
  const isDev = !app.isPackaged || process.argv.includes('--dev')

  ipcMain.on('to-planar-graph-sync', (event: IpcMainEvent, payload: unknown) => {
    try {
      const p = payload as { nodes?: unknown[]; edges?: unknown[]; gapTolerance?: number }
      event.returnValue = {
        success: true,
        data: toPlanarGraphLib.toPlanarGraph(
          (p?.nodes || []) as never[],
          (p?.edges || []) as never[],
          p?.gapTolerance ?? (undefined as never)
        )
      }
    } catch (err) {
      const error = err as Error
      event.returnValue = {
        success: false,
        error: error.message
      }
    }
  })

  ipcMain.on('discover-planar-faces-sync', (event: IpcMainEvent, payload: unknown) => {
    try {
      const p = payload as { nodes?: unknown[]; edges?: unknown[] }
      const solver = new planarFaceDiscoveryLib.PlanarFaceTree()
      event.returnValue = {
        success: true,
        data: solver.discover((p?.nodes || []) as never[], (p?.edges || []) as never[])
      }
    } catch (err) {
      const error = err as Error
      event.returnValue = {
        success: false,
        error: error.message
      }
    }
  })

  // Parse a DXF file and return structured entity data.
  ipcMain.handle('parse-dxf', async (_event, payload: unknown): Promise<ParseResult> => {
    try {
      const target =
        typeof payload === 'string'
          ? { filePath: payload }
          : (payload as { filePath?: string; bookmark?: string }) || {}
      const filePath = target.filePath || ''
      const bookmark = normalizeBookmark(target.bookmark)
      if (!filePath) {
        return { success: false, error: 'No DXF path provided' }
      }

      const parser = new DxfParser()
      const { content, dxf } = await withSecurityScopedAccess(bookmark, async () => {
        const text = readFileSync(filePath, 'utf-8')
        return {
          content: text,
          dxf: parser.parseSync(text)
        }
      })
      return { success: true, data: dxf, raw: content }
    } catch (err) {
      const error = err as Error
      return { success: false, error: error.message }
    }
  })

  // Open file dialog for DXF files.
  ipcMain.handle('open-file-dialog', async (): Promise<FileDialogResult[]> => {
    const result = await dialog.showOpenDialog(getMainWindow() ?? (undefined as never), {
      title: 'Select DXF Files',
      filters: [{ name: 'DXF Files', extensions: ['dxf'] }],
      properties: ['openFile', 'multiSelections'],
      securityScopedBookmarks: isMasBuild()
    })
    if (result.canceled) return []
    return Promise.all(
      result.filePaths.map(async (filePath, index) => {
        const bookmark = normalizeBookmark(result.bookmarks?.[index])
        const size = await withSecurityScopedAccess(bookmark, async () => statSync(filePath).size)
        return {
          path: filePath,
          name: path.basename(filePath),
          size,
          bookmark
        }
      })
    )
  })

  ipcMain.handle('save-placement-json', async (_event, payload: unknown): Promise<SaveResult> => {
    try {
      const p = payload as { name?: string }
      const safeName =
        String(p?.name || 'nesting-job')
          .replace(/[^a-z0-9-_]+/gi, '-')
          .replace(/^-+|-+$/g, '') || 'nesting-job'
      const tempDir = path.join(app.getPath('temp'), 'nestkit-debug')
      cleanupTempArtifacts(tempDir)
      mkdirSync(tempDir, { recursive: true })

      const fileName = `${safeName}-placement.json`
      const filePath = path.join(tempDir, fileName)
      writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8')

      return { success: true, path: filePath }
    } catch (err) {
      const error = err as Error
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('open-external-url', async (_event, targetUrl: unknown): Promise<SaveResult> => {
    try {
      const url = String(targetUrl || '').trim()
      if (!url) return { success: false, error: 'No URL provided' }
      await shell.openExternal(url)
      return { success: true }
    } catch (err) {
      const error = err as Error
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(
    'load-app-settings',
    async (): Promise<{ success: boolean; settings?: unknown; error?: string }> => {
      try {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json')
        if (!existsSync(settingsPath)) {
          return { success: true, settings: {} }
        }

        const raw = readFileSync(settingsPath, 'utf-8')
        return { success: true, settings: JSON.parse(raw) || {} }
      } catch (err) {
        const error = err as Error
        return { success: false, error: error.message, settings: {} }
      }
    }
  )

  ipcMain.handle('save-app-settings', async (_event, settings: unknown): Promise<SaveResult> => {
    try {
      const settingsPath = path.join(app.getPath('userData'), 'settings.json')
      mkdirSync(path.dirname(settingsPath), { recursive: true })
      writeFileSync(settingsPath, JSON.stringify(settings || {}, null, 2), 'utf-8')
      return { success: true, path: settingsPath }
    } catch (err) {
      const error = err as Error
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(
    'load-job-state',
    async (): Promise<{ success: boolean; state?: unknown; error?: string }> => {
      try {
        const statePath = path.join(app.getPath('userData'), 'job-state.json')
        if (!existsSync(statePath)) {
          return { success: true, state: null }
        }

        const raw = readFileSync(statePath, 'utf-8')
        return { success: true, state: JSON.parse(raw) || null }
      } catch (err) {
        const error = err as Error
        return { success: false, error: error.message, state: null }
      }
    }
  )

  ipcMain.handle('save-job-state', async (_event, jobState: unknown): Promise<SaveResult> => {
    try {
      const statePath = path.join(app.getPath('userData'), 'job-state.json')
      mkdirSync(path.dirname(statePath), { recursive: true })
      writeFileSync(statePath, JSON.stringify(jobState || {}, null, 2), 'utf-8')
      return { success: true, path: statePath }
    } catch (err) {
      const error = err as Error
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('write-debug-svg', async (_event, payload: unknown): Promise<SaveResult> => {
    try {
      if (!isDev) {
        return { success: false, error: 'Debug SVG export is disabled in production' }
      }
      const p = payload as { name?: string; svg?: string }
      const safeName =
        String(p?.name || 'debug-contour')
          .replace(/[^a-z0-9-_]+/gi, '-')
          .replace(/^-+|-+$/g, '') || 'debug-contour'
      const debugDir = path.join(app.getPath('userData'), 'debug')
      mkdirSync(debugDir, { recursive: true })

      const fileName = `${safeName}.svg`
      const filePath = path.join(debugDir, fileName)
      writeFileSync(filePath, String(p?.svg || ''), 'utf-8')

      return { success: true, path: filePath }
    } catch (err) {
      const error = err as Error
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('write-debug-json', async (_event, payload: unknown): Promise<SaveResult> => {
    try {
      if (!isDev) {
        return { success: false, error: 'Debug JSON export is disabled in production' }
      }
      const p = payload as { name?: string; data?: unknown }
      const safeName =
        String(p?.name || 'debug-contour')
          .replace(/[^a-z0-9-_]+/gi, '-')
          .replace(/^-+|-+$/g, '') || 'debug-contour'
      const debugDir = path.join(app.getPath('userData'), 'debug')
      mkdirSync(debugDir, { recursive: true })

      const fileName = `${safeName}.json`
      const filePath = path.join(debugDir, fileName)
      writeFileSync(filePath, JSON.stringify(p?.data ?? null, null, 2), 'utf-8')

      return { success: true, path: filePath }
    } catch (err) {
      const error = err as Error
      return { success: false, error: error.message }
    }
  })

  // Open a folder picker for DXF export destination.
  ipcMain.handle(
    'choose-export-folder',
    async (): Promise<{ canceled?: boolean; path?: string; bookmark?: string | null }> => {
      const result = await dialog.showOpenDialog(getMainWindow() ?? (undefined as never), {
        title: 'Choose Export Folder',
        properties: ['openDirectory', 'createDirectory'],
        securityScopedBookmarks: isMasBuild()
      })
      if (result.canceled || !result.filePaths.length) return { canceled: true }
      return {
        path: result.filePaths[0],
        bookmark: normalizeBookmark(result.bookmarks?.[0])
      }
    }
  )
}
