import type { DxfFile, NestSheet } from '../../types/dxf'
import type { SettingsObject } from '../../types/settings'
import { clonePlain, effectiveFileQty } from '../helpers'

export interface AppState {
  files: DxfFile[]
  sheets: NestSheet[]
  status: string
  zoom: number
  nestResult: any | null
  lastExportPath: string | null
  settings: SettingsObject
  editingSheetId: string | null
  activeStripIndex: number
  lastPlacementExportItems: any | null
  nestInputPath: string | null
}

export const state: AppState = {
  files: [],
  sheets: [],
  status: 'idle',
  zoom: 1,
  nestResult: null,
  lastExportPath: null,
  settings: {} as SettingsObject,
  editingSheetId: null,
  activeStripIndex: 0,
  lastPlacementExportItems: null,
  nestInputPath: null
}

let persistJobTimer: number | null = null

export function snapshotJobState() {
  return {
    files: state.files.map((file: any) => ({
      id: file.id,
      name: file.name,
      size: file.size || 0,
      path: file.path || null,
      bookmark: file.bookmark || null,
      qty: effectiveFileQty(file),
      shapes: clonePlain(file.shapes || null),
      layers: clonePlain(file.layers || null),
      _multiSketchDetection:
        typeof file._multiSketchDetection === 'boolean' ? file._multiSketchDetection : null,
      _sketchContourMethod: file._sketchContourMethod || null
    })),
    sheets: state.sheets.map((sheet: any) => ({
      id: sheet.id,
      width: sheet.width ?? null,
      height: sheet.height ?? null,
      widthMode: sheet.widthMode || 'fixed',
      material: sheet.material || ''
    }))
  }
}

export async function persistJobStateNow(): Promise<void> {
  if (!window.electronAPI?.saveJobState) return
  const result = await window.electronAPI.saveJobState(snapshotJobState())
  if (!result?.success) {
    console.error('[Job State] Failed to save:', result?.error)
  }
}

export function schedulePersistJobState(): void {
  if (persistJobTimer) window.clearTimeout(persistJobTimer)
  persistJobTimer = window.setTimeout(() => {
    persistJobTimer = null
    persistJobStateNow()
  }, 120)
}

export async function hydrateJobState(): Promise<boolean> {
  if (!window.electronAPI?.loadJobState) return false
  const result = await window.electronAPI.loadJobState()
  if (!result?.success) {
    console.warn('[Job State] Failed to load:', result?.error)
    return false
  }
  if (!result.state) return false

  state.files = Array.isArray((result.state as any).files)
    ? (result.state as any).files.map((file: any) => ({
        ...file,
        qty: effectiveFileQty(file),
        _multiSketchDetection:
          typeof file?._multiSketchDetection === 'boolean' ? file._multiSketchDetection : null,
        _sketchContourMethod: file?._sketchContourMethod || null
      }))
    : []
  state.sheets = Array.isArray((result.state as any).sheets) ? (result.state as any).sheets : []
  return state.files.length > 0 || state.sheets.length > 0
}

export function createAppStore() {
  return {
    state,
    snapshotJobState,
    persistJobStateNow,
    schedulePersistJobState,
    hydrateJobState
  }
}
