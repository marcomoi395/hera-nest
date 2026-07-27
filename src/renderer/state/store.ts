import type { DxfFile, NestSheet, NestResult } from '../../types/dxf-types'
import type { SettingsObject, NestPlacementExportItem } from '../../types/settings'
import { clonePlain, effectiveFileQty } from '../helpers'

export interface AppState {
  files: DxfFile[]
  sheets: NestSheet[]
  status: string
  zoom: number
  nestResult: NestResult | null
  lastExportPath: string | null
  settings: SettingsObject
  editingSheetId: string | null
  activeStripIndex: number
  lastPlacementExportItems: NestPlacementExportItem[] | null
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

export function snapshotJobState(): AppState {
  return {
    files: clonePlain(state.files),
    sheets: clonePlain(state.sheets),
    status: state.status,
    zoom: state.zoom,
    nestResult: clonePlain(state.nestResult),
    lastExportPath: state.lastExportPath,
    settings: clonePlain(state.settings),
    editingSheetId: state.editingSheetId,
    activeStripIndex: state.activeStripIndex,
    lastPlacementExportItems: clonePlain(state.lastPlacementExportItems),
    nestInputPath: state.nestInputPath
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

  const loadedState = result.state as Partial<AppState> | undefined
  state.files = Array.isArray(loadedState?.files)
    ? loadedState.files!.map((file) => ({
        ...file,
        qty: effectiveFileQty(file),
        _multiSketchDetection:
          typeof file?._multiSketchDetection === 'boolean' ? file._multiSketchDetection : undefined,
        _sketchContourMethod: file?._sketchContourMethod || undefined
      }))
    : []
  state.sheets = Array.isArray(loadedState?.sheets) ? loadedState.sheets! : []
  return state.files.length > 0 || state.sheets.length > 0
}

export function createAppStore(): { state: AppState } {
  return {
    state
  }
}
