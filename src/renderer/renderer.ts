import { state, schedulePersistJobState, hydrateJobState } from './state/store'
import { DEFAULT_ENGRAVING_COLOR } from '../shared/constants'
import * as NestHelpers from './helpers'
import { createDxfService, type DxfServiceApi } from './services/dxf-service'
import { createCanvasView, type CanvasViewApi } from './views/canvas-view'
import { createSheetsPane, type SheetsPaneAPI } from './views/sheets-pane'
import { createSheetModal, type SheetModalApi, type SheetModalDeps } from './views/sheet-modal'
import {
  createExportService,
  type ExportServiceApi,
  type ExportServiceDeps
} from './services/export-service'
import {
  createNestingService,
  type NestingServiceApi,
  type NestingServiceDeps
} from './services/nesting-service'
import { createFilesPane, type FilesPaneApi, type FilesPaneDeps } from './views/files-pane'
import { createDxfPreviewModal, type DxfPreviewModalApi } from './views/dxf-preview-modal'
import {
  createSettingsModal,
  type SettingsModalApi,
  type SettingsModalDeps
} from './views/settings-modal'
import { createModalCustomSelects } from './views/custom-selects'
import { createLinuxAppMenu } from './views/linux-app-menu'
import { parseDXFToShapes } from './services/dxf-preview-service'
import type { SettingsObject } from '../types/settings'
import type { DxfFile, DxfLayer } from '../types/dxf-types'

// ─── Platform detection ───────────────────────────────────────────────────────
const platformString = String(
  (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent ||
    ''
).toLowerCase()

if (platformString.includes('win')) {
  document.body.classList.add('platform-win')
} else if (platformString.includes('mac')) {
  document.body.classList.add('platform-mac')
} else {
  document.body.classList.add('platform-linux')
}

// ─── DOM references ───────────────────────────────────────────────────────────
const dom = {
  startBtn: document.getElementById('startBtn') as HTMLButtonElement | null,
  stopBtn: document.getElementById('stopBtn') as HTMLButtonElement | null,
  statusChip: document.getElementById('statusChip') as HTMLDivElement | null,
  feedbackBanner: document.getElementById('feedbackBanner') as HTMLDivElement | null,
  feedbackBannerAction: document.getElementById('feedbackBannerAction') as HTMLButtonElement | null,
  feedbackBannerClose: document.getElementById('feedbackBannerClose') as HTMLButtonElement | null,
  fileList: document.getElementById('fileList') as HTMLDivElement | null,
  sheetList: document.getElementById('sheetList') as HTMLDivElement | null,
  dropZone: document.getElementById('dropZone') as HTMLDivElement | null,
  clearFilesBtn: document.getElementById('clearFilesBtn') as HTMLButtonElement | null,
  addFileBtn: document.getElementById('addFileBtn') as HTMLButtonElement | null,
  addSheetBtn: document.getElementById('addSheetBtn') as HTMLButtonElement | null,
  emptyState: document.getElementById('emptyState') as HTMLDivElement | null,
  viewport: document.getElementById('viewport') as HTMLDivElement | null,
  svgContainer: document.getElementById('svgContainer') as HTMLDivElement | null,
  canvasTabs: document.getElementById('canvasTabs') as HTMLDivElement | null,
  zoomLabel: document.getElementById('zoomLabel') as HTMLSpanElement | null,
  nestStats: document.getElementById('nestStats') as HTMLDivElement | null,
  canvasStatusbar: document.getElementById('canvasStatusbar') as HTMLDivElement | null,
  openSettings: document.getElementById('openSettings') as HTMLButtonElement | null,
  settingsModal: document.getElementById('settingsModal') as HTMLDivElement | null,
  closeSettings: document.getElementById('closeSettings') as HTMLButtonElement | null,
  applySettings: document.getElementById('applySettings') as HTMLButtonElement | null,
  resetSettings: document.getElementById('resetSettings') as HTMLButtonElement | null,
  settingsFields: Array.from(
    document.getElementById('settingsModal')?.querySelectorAll('[data-setting-key]') || []
  ),
  sheetModal: document.getElementById('sheetModal') as HTMLDivElement | null,
  confirmSheet: document.getElementById('confirmSheet') as HTMLButtonElement | null,
  cancelSheet: document.getElementById('cancelSheet') as HTMLButtonElement | null,
  closeSheet: document.getElementById('closeSheet') as HTMLButtonElement | null,
  sheetWidth: document.getElementById('sheetWidth') as HTMLInputElement | null,
  sheetHeight: document.getElementById('sheetHeight') as HTMLInputElement | null,
  sheetWidthMode: document.getElementById('sheetWidthMode') as HTMLSelectElement | null,
  sheetModeHelp: document.getElementById('sheetModeHelp') as HTMLDivElement | null,
  sheetMaterial: document.getElementById('sheetMaterial') as HTMLInputElement | null,
  zoomIn: document.getElementById('zoomIn') as HTMLButtonElement | null,
  zoomOut: document.getElementById('zoomOut') as HTMLButtonElement | null,
  fitView: document.getElementById('fitView') as HTMLButtonElement | null,
  exportModal: document.getElementById('exportModal') as HTMLDivElement | null,
  exportClose: document.getElementById('exportClose') as HTMLButtonElement | null,
  exportCancel: document.getElementById('exportCancel') as HTMLButtonElement | null,
  exportDXFBtn: document.getElementById('exportDXF') as HTMLButtonElement | null,
  exportChooseFolder: document.getElementById('exportChooseFolder') as HTMLButtonElement | null,
  exportFolderLabel: document.getElementById('exportFolderLabel') as HTMLSpanElement | null,
  exportTableBody: document.getElementById('exportTableBody') as HTMLTableSectionElement | null,
  exportSummarySheets: document.getElementById('exportSummarySheets') as HTMLSpanElement | null,
  exportSummaryUtil: document.getElementById('exportSummaryUtil') as HTMLSpanElement | null,
  exportSummaryParts: document.getElementById('exportSummaryParts') as HTMLSpanElement | null,
  exportSummaryLength: document.getElementById('exportSummaryLength') as HTMLSpanElement | null,
  openExportBtn: document.getElementById('openExport') as HTMLButtonElement | null,
  canvasArea: document.getElementById('canvasArea') as HTMLDivElement | null
}

// ─── Constants ────────────────────────────────────────────────────────────────
// Imported from ../shared/constants instead of window.NestConstants
const { partLabelFromName } = NestHelpers
const FEEDBACK_BANNER_STORAGE_KEY = 'heranest.feedback-banner.dismissedAt.v2'
const FEEDBACK_BANNER_FIRST_SEEN_KEY = 'heranest.feedback-banner.firstSeenAt.v1'
const FEEDBACK_SUPPORT_URL = 'https://github.com/marcomoi395/hera-nest/issues'
const FEEDBACK_BANNER_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000
const FEEDBACK_BANNER_FIRST_SHOW_DELAY_MS = 14 * 24 * 60 * 60 * 1000

let dragDebugTimer: number | null = null

// ─── Status chip ──────────────────────────────────────────────────────────────
function setStatus(status: string): void {
  state.status = status
  const dot = dom.statusChip?.querySelector('.status-dot')
  const label = dom.statusChip?.querySelector('.status-label')
  if (dot) dot.className = 'status-dot ' + status
  const labels: Record<string, string> = {
    idle: 'Idle',
    running: 'Running…',
    done: 'Complete',
    error: 'Error'
  }
  if (label) label.textContent = labels[status] || status
}

function setNestStatsTone(tone = ''): void {
  if (!dom.canvasStatusbar) return
  dom.canvasStatusbar.classList.toggle('error', tone === 'error')
  dom.canvasStatusbar.classList.toggle('warning', tone === 'warning')
}

function syncViewportEmptyState(isEmpty: boolean): void {
  if (!dom.viewport) return
  dom.viewport.classList.toggle('empty-grid', !!isEmpty)
}

function setFeedbackBannerVisible(isVisible: boolean): void {
  if (!dom.feedbackBanner) return
  dom.feedbackBanner.hidden = !isVisible
}

function dismissFeedbackBanner(): void {
  try {
    window.localStorage?.setItem(FEEDBACK_BANNER_STORAGE_KEY, String(Date.now()))
  } catch {
    // Ignore persistence failures
  }
  setFeedbackBannerVisible(false)
}

function openFeedbackUrl(): void {
  if (window.electronAPI?.openExternalUrl) {
    window.electronAPI.openExternalUrl(FEEDBACK_SUPPORT_URL).catch((error) => {
      console.error('[Feedback Banner] Failed to open support URL:', error)
    })
    return
  }
  window.open(FEEDBACK_SUPPORT_URL, '_blank', 'noopener')
}

function bindFeedbackBanner(): void {
  if (!dom.feedbackBanner || !dom.feedbackBannerAction || !dom.feedbackBannerClose) return
  let showBanner = true
  try {
    const now = Date.now()
    const firstSeenRaw = window.localStorage?.getItem(FEEDBACK_BANNER_FIRST_SEEN_KEY)
    let firstSeenAt = Number(firstSeenRaw)
    if (!Number.isFinite(firstSeenAt) || firstSeenAt <= 0) {
      firstSeenAt = now
      window.localStorage?.setItem(FEEDBACK_BANNER_FIRST_SEEN_KEY, String(firstSeenAt))
    }

    const rawValue = window.localStorage?.getItem(FEEDBACK_BANNER_STORAGE_KEY)
    if (rawValue) {
      const dismissedAt = Number(rawValue)
      if (Number.isFinite(dismissedAt) && dismissedAt > 0) {
        showBanner = now - dismissedAt >= FEEDBACK_BANNER_COOLDOWN_MS
      } else {
        window.localStorage?.setItem(FEEDBACK_BANNER_STORAGE_KEY, String(now))
        showBanner = false
      }
    }
    if (showBanner) {
      showBanner = now - firstSeenAt >= FEEDBACK_BANNER_FIRST_SHOW_DELAY_MS
    }
  } catch {
    showBanner = false
  }
  setFeedbackBannerVisible(showBanner)

  dom.feedbackBannerAction.addEventListener('click', () => {
    openFeedbackUrl()
    dismissFeedbackBanner()
  })
  dom.feedbackBannerClose.addEventListener('click', dismissFeedbackBanner)
}

// ─── Service APIs ─────────────────────────────────────────────────────────────
function currentNestingSettings(): SettingsObject {
  return settingsModalApi.currentNestingSettings()
}

function engravingLayerIndex(settings: SettingsObject = currentNestingSettings()): number | null {
  const raw = settings?.engravingLayer
  if (raw === 'off' || raw === 'false' || raw == null || raw === '') return null
  const parsed = Number.parseInt(String(raw), 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 2
}

function batchLayerAtIndex(index: number): DxfLayer | null {
  if (!Number.isFinite(index) || index < 1) return null
  for (const file of state.files || []) {
    const layer = Array.isArray(file?.layers) ? file.layers[index - 1] : null
    if (layer?.name || layer?.color) return layer
  }
  return null
}

function resolveEngravingColor(layers: DxfLayer[] = []): string {
  const idx = engravingLayerIndex()
  if (idx !== null && layers[idx - 1]?.color) return layers[idx - 1].color
  const batchLayer = idx !== null ? batchLayerAtIndex(idx) : null
  if (batchLayer?.color) return batchLayer.color
  if (idx !== null) {
    const FALLBACK_PALETTE: string[] = []
    if (FALLBACK_PALETTE.length) return FALLBACK_PALETTE[(idx - 1) % FALLBACK_PALETTE.length]
  }
  if (layers[0]?.color) return layers[0].color
  return DEFAULT_ENGRAVING_COLOR
}

function engravingStyle(settings: SettingsObject = currentNestingSettings()): string {
  const raw = settings?.engravingStyle
  if (
    raw === 'simple' ||
    raw === 'stroked' ||
    raw === 'last-char' ||
    raw === 'last-two-chars' ||
    raw === 'last-three-chars' ||
    raw === 'first-char' ||
    raw === 'first-two-chars' ||
    raw === 'first-three-chars'
  )
    return raw
  return 'stroked'
}

// Services - initialized in initializeRenderer() to avoid race condition with window.NestResultScoring
let dxfServiceApi: DxfServiceApi
let canvasViewApi: CanvasViewApi
let sheetModalApi: SheetModalApi
let sheetsPaneApi: SheetsPaneAPI
let exportServiceApi: ExportServiceApi
let nestingServiceApi: NestingServiceApi
let filesPaneApi: FilesPaneApi
let dxfPreviewModalApi: DxfPreviewModalApi
let settingsModalApi: SettingsModalApi

// ─── Drag-and-drop helpers ────────────────────────────────────────────────────
function showDragDebug(message: string, details = ''): void {
  const normalized = String(message || '')
  const previousText = dom.nestStats?.textContent || ''
  const previousTitle = dom.nestStats?.title || ''
  let userMessage = 'Drop DXF files here to import'
  if (/^added\s+\d+/i.test(normalized)) {
    userMessage = normalized.replace(/^added/i, 'Imported')
  } else if (/^drop ignored:/i.test(normalized)) {
    userMessage = 'No DXF files found in the drop'
  }

  if (details) console.debug('[DND]', normalized, details)
  else if (normalized) console.debug('[DND]', normalized)

  setNestStatsTone('')
  if (dom.nestStats) {
    dom.nestStats.textContent = userMessage
    dom.nestStats.title = ''
  }
  if (dragDebugTimer) window.clearTimeout(dragDebugTimer)
  dragDebugTimer = window.setTimeout(() => {
    if (dom.nestStats && dom.nestStats.textContent === userMessage) {
      dom.nestStats.textContent = previousText || 'Drag DXF files here to import'
      dom.nestStats.title = previousTitle || ''
    }
  }, 5000)
}

interface DroppedFile {
  name: string
  size: number
  path: string | null
}

function normalizeDroppedFiles(fileList: File[]): DroppedFile[] {
  const files = [...fileList]
    .filter((f) => f.name.toLowerCase().endsWith('.dxf'))
    .map((f) => ({
      name: f.name,
      size: f.size,
      path:
        (f as File & { path?: string }).path ||
        window.electronAPI?.getPathForDroppedFile?.(f) ||
        null
    }))
  showDragDebug(
    `normalized ${files.length} DXF file${files.length === 1 ? '' : 's'}`,
    files.map((f) => `${f.name} :: ${f.path || 'no-path'}`).join('\n')
  )
  return files
}

function extractDroppedFileObjects(dt: DataTransfer): File[] {
  const files: File[] = []
  const seen = new Set<string>()

  const pushFile = (file: File | null): void => {
    if (!file) return
    const name = String(file.name || '')
    if (!name) return
    const path =
      (file as File & { path?: string }).path ||
      window.electronAPI?.getPathForDroppedFile?.(file) ||
      ''
    const key = `${path}::${name}::${file.size || 0}`
    if (seen.has(key)) return
    seen.add(key)
    files.push(file)
  }

  Array.from(dt?.files || []).forEach(pushFile)
  Array.from(dt?.items || [])
    .filter((item) => item?.kind === 'file')
    .forEach((item) => {
      try {
        pushFile(item.getAsFile())
      } catch {
        // Ignore per-item extraction failures
      }
    })

  return files
}

function dataTransferHasFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false
  if (dt.files?.length) return true
  return Array.from(dt.items || []).some((item) => item.kind === 'file')
}

function handleDroppedDataTransfer(dt: DataTransfer): boolean {
  showDragDebug(
    `drop received: ${dt?.files?.length || 0} file${dt?.files?.length === 1 ? '' : 's'}`,
    Array.from(dt?.files || [])
      .map((f) => `${f.name} :: ${(f as File & { path?: string }).path || 'no-path'}`)
      .join('\n')
  )
  const files = normalizeDroppedFiles(extractDroppedFileObjects(dt))
  if (!files.length) {
    showDragDebug('drop ignored: no DXF files found')
    return false
  }
  filesPaneApi.addFiles(files)
  showDragDebug(
    `added ${files.length} DXF file${files.length === 1 ? '' : 's'}`,
    files.map((f) => `${f.name} :: ${f.path || 'no-path'}`).join('\n')
  )
  return true
}


function bindDragAndDrop(): void {
  if (!dom.dropZone || !dom.canvasArea) return

  dom.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault()
    dom.dropZone!.classList.add('drag-over')
  })
  dom.dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault()
    dom.dropZone!.classList.add('drag-over')
  })
  dom.dropZone.addEventListener('dragleave', () => dom.dropZone!.classList.remove('drag-over'))
  dom.dropZone.addEventListener('drop', (e) => {
    e.preventDefault()
    dom.dropZone!.classList.remove('drag-over')
    if (e.dataTransfer) handleDroppedDataTransfer(e.dataTransfer)
  })

  dom.dropZone.addEventListener('click', async () => {
    if (window.electronAPI?.openFileDialog) {
      const files = await window.electronAPI.openFileDialog()
      filesPaneApi.addFiles(files)
    }
  })

  dom.canvasArea.addEventListener('dragover', (e) => e.preventDefault())
  dom.canvasArea.addEventListener('drop', (e) => {
    e.preventDefault()
    if (e.dataTransfer) handleDroppedDataTransfer(e.dataTransfer)
  })

  window.addEventListener(
    'dragenter',
    (e) => {
      e.preventDefault()
      showDragDebug(
        `dragenter: files=${e.dataTransfer?.files?.length || 0} items=${e.dataTransfer?.items?.length || 0}`
      )
      if (dataTransferHasFiles(e.dataTransfer)) dom.dropZone!.classList.add('drag-over')
    },
    true
  )

  window.addEventListener(
    'dragover',
    (e) => {
      e.preventDefault()
      showDragDebug(
        `dragover: files=${e.dataTransfer?.files?.length || 0} items=${e.dataTransfer?.items?.length || 0}`
      )
      if (dataTransferHasFiles(e.dataTransfer)) dom.dropZone!.classList.add('drag-over')
    },
    true
  )

  window.addEventListener(
    'drop',
    (e) => {
      e.preventDefault()
      dom.dropZone!.classList.remove('drag-over')
      if (e.dataTransfer) handleDroppedDataTransfer(e.dataTransfer)
    },
    true
  )

  window.addEventListener(
    'dragleave',
    (e) => {
      if (
        e.target === document ||
        e.target === document.documentElement ||
        e.target === document.body
      ) {
        dom.dropZone!.classList.remove('drag-over')
      }
    },
    true
  )
}

function bindOverlayClose(): void {
  ;[dom.settingsModal, dom.sheetModal].forEach((modal) => {
    if (!modal) return
    modal.addEventListener('click', (e) => {
      if (e.target !== modal) return
      if (modal === dom.sheetModal) {
        sheetModalApi.closeSheetDialog()
        return
      }
      modal.classList.remove('open')
    })
  })
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
export async function initializeRenderer(): Promise<void> {
  console.log('[RENDERER] initializeRenderer called')
  console.log('[RENDERER] DOM refs:', {
    addSheetBtn: dom.addSheetBtn,
    openSettings: dom.openSettings,
    dropZone: dom.dropZone,
    startBtn: dom.startBtn
  })

  // Initialize services here (after main.ts has set up window.NestResultScoring)
  dxfServiceApi = createDxfService({
    state,
    getCurrentNestingSettings: currentNestingSettings
  })

  canvasViewApi = createCanvasView({
    state,
    dom: {
      canvasTabs: dom.canvasTabs ?? undefined,
      viewport: dom.viewport ?? undefined,
      svgContainer: dom.svgContainer ?? undefined,
      nestStats: dom.nestStats ?? undefined,
      emptyState: dom.emptyState ?? undefined,
      zoomLabel: dom.zoomLabel ?? undefined,
      zoomIn: dom.zoomIn ?? undefined,
      zoomOut: dom.zoomOut ?? undefined,
      fitView: dom.fitView ?? undefined
    },
    setNestStatsTone,
    syncViewportEmptyState
  })

  exportServiceApi = createExportService({
    state,
    dom: dom as unknown as ExportServiceDeps['dom'], // Full dom has all required properties
    getCurrentNestingSettings: currentNestingSettings
  })

  sheetsPaneApi = createSheetsPane({
    state,
    dom,
    schedulePersistJobState,
    getOpenSheetEditor: () => sheetModalApi?.openSheetEditor,
    renderTabs: canvasViewApi.renderTabs
  })

  sheetModalApi = createSheetModal({
    state,
    dom: dom as unknown as SheetModalDeps['dom'], // Full dom has all required properties
    schedulePersistJobState,
    renderSheets: sheetsPaneApi.renderSheets
  })

  nestingServiceApi = createNestingService({
    state,
    dom: dom as unknown as NestingServiceDeps['dom'], // Full dom has all required properties
    getCurrentNestingSettings: currentNestingSettings,
    exportPlacementJSON: dxfServiceApi.exportPlacementJSON,
    setStatus,
    setNestStatsTone,
    showNestResult: canvasViewApi.showNestResult,
    renderTabs: canvasViewApi.renderTabs,
    syncExportButton: exportServiceApi.syncExportButton
  })

  filesPaneApi = createFilesPane({
    state,
    dom: dom as unknown as FilesPaneDeps['dom'], // Full dom has all required properties
    schedulePersistJobState,
    hydrateFileShapesForList: dxfServiceApi.hydrateFileShapesForList
  })

  dxfPreviewModalApi = createDxfPreviewModal({
    state
  })

  settingsModalApi = createSettingsModal({
    state,
    dom: dom as unknown as SettingsModalDeps['dom'], // Full dom has all required properties
    onSettingsApplied: () => {
      if (typeof (window as { refreshDXFPreview?: () => void }).refreshDXFPreview === 'function')
        (window as { refreshDXFPreview?: () => void }).refreshDXFPreview?.()
      if (state.nestResult && state.sheets.length) canvasViewApi.showNestResult()
    }
  })

  const customSelectsApi = createModalCustomSelects()
  const linuxAppMenuApi = createLinuxAppMenu()

  filesPaneApi.bind()
  sheetsPaneApi.bind()
  sheetsPaneApi.renderSheets()
  sheetModalApi.bind()
  settingsModalApi.bind()
  canvasViewApi.bind()
  exportServiceApi.bind()
  nestingServiceApi.bind()
  bindFeedbackBanner()
  bindDragAndDrop()
  bindOverlayClose()
  customSelectsApi?.enhanceModalSelects?.()
  linuxAppMenuApi?.bind?.()

  await settingsModalApi.loadPersistedSettings()
  exportServiceApi.loadLastExportFolder()
  sheetModalApi.updateSheetModeControls()
  syncViewportEmptyState(true)

  const restored = await hydrateJobState()
  if (!restored) {
    state.files = []
    state.sheets = []
  }

  const currentSettings = currentNestingSettings()
  const contourMethod = String(currentSettings?.sketchContourMethod || 'auto')
  const multiSketchDetection = !!currentSettings?.multiSketchDetection
  let backfilledLegacyFileMetadata = false
  state.files.forEach((file: DxfFile) => {
    if (!Array.isArray(file?.shapes) || !file.shapes.length) return
    if (typeof file._multiSketchDetection !== 'boolean') {
      file._multiSketchDetection = multiSketchDetection
      backfilledLegacyFileMetadata = true
    }
    if (!file._sketchContourMethod) {
      file._sketchContourMethod = contourMethod
      backfilledLegacyFileMetadata = true
    }
  })
  if (backfilledLegacyFileMetadata) schedulePersistJobState()

  filesPaneApi.renderFiles()
  sheetsPaneApi.renderSheets()
  exportServiceApi.syncExportButton()
}
