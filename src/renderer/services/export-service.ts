import { formatWidthMeters } from '../helpers'
import type { AppState } from '../state/store'
import type { SettingsObject } from '../../types/settings'
import type { Strip, NestSheet } from '../../types/dxf-types'

interface ExportServiceDOM {
  exportFolderLabel: HTMLElement
  exportDXFBtn: HTMLButtonElement
  exportSummarySheets: HTMLElement
  exportSummaryParts: HTMLElement
  exportSummaryUtil: HTMLElement
  exportSummaryLength: HTMLElement
  exportTableBody: HTMLTableSectionElement
  exportModal: HTMLElement
  openExportBtn: HTMLButtonElement
  exportClose: HTMLButtonElement
  exportCancel: HTMLButtonElement
  exportChooseFolder: HTMLButtonElement
  [key: string]: unknown
}

export interface ExportServiceDeps {
  state: AppState
  dom: ExportServiceDOM
  getCurrentNestingSettings: () => SettingsObject
}

export interface ExportServiceApi {
  loadLastExportFolder: () => Promise<void>
  syncExportButton: () => void
  bind: () => void
}

export function createExportService({
  state,
  dom,
  getCurrentNestingSettings
}: ExportServiceDeps): ExportServiceApi {
  let exportFolderPath: string | null = null
  let exportFolderBookmark: string | null = null

  function canExportFinalSheets(): boolean {
    return !!(state.nestResult?.strips?.length && !state.nestResult?.is_preview)
  }

  function exportSheetWidthForStrip(strip: Strip, sheet: NestSheet): number {
    if (sheet?.widthMode === 'fixed') {
      const configuredWidth = Number(sheet?.width)
      if (Number.isFinite(configuredWidth) && configuredWidth > 0) return configuredWidth
    }
    return Number(strip?.strip_width) || 0
  }

  function exportSheetDensityForStrip(strip: Strip, sheet: NestSheet): number {
    const rawDensity = Number(strip?.density)
    if (!Number.isFinite(rawDensity)) return 0

    const rawWidth = Number(strip?.strip_width)
    const rawHeight = Number(strip?.strip_height) || Number(sheet?.height)
    const targetWidth = exportSheetWidthForStrip(strip, sheet)

    if (
      !Number.isFinite(rawWidth) ||
      rawWidth <= 0 ||
      !Number.isFinite(rawHeight) ||
      rawHeight <= 0
    ) {
      return rawDensity
    }
    if (sheet?.widthMode !== 'fixed') return rawDensity

    const usedArea = rawDensity * rawWidth * rawHeight
    const fixedArea = targetWidth * rawHeight
    if (!Number.isFinite(fixedArea) || fixedArea <= 0) return rawDensity
    return usedArea / fixedArea
  }

  function roundUpDim(mm: number): number {
    return Math.ceil(mm)
  }

  function utilClass(pct: number): string {
    if (pct >= 75) return ''
    if (pct >= 50) return 'warn'
    return 'low'
  }

  function shortPath(fullPath: string | null | undefined): string {
    const parts = (fullPath || '').replace(/\\/g, '/').split('/').filter(Boolean)
    return parts.slice(-2).join('/')
  }

  function applyExportFolder(folderPath: string, bookmark: string | null = null): void {
    exportFolderPath = folderPath
    exportFolderBookmark = bookmark
    if (dom.exportFolderLabel) {
      dom.exportFolderLabel.textContent = shortPath(folderPath)
      dom.exportFolderLabel.classList.remove('export-folder-success', 'export-folder-error')
    }
    if (dom.exportDXFBtn) {
      dom.exportDXFBtn.disabled = false
      dom.exportDXFBtn.textContent = 'Export DXF'
    }
  }

  function normalizeStoredExportFolder(
    saved: unknown
  ): { path: string; bookmark: string | null } | null {
    if (!saved) return null
    if (typeof saved === 'string') {
      return saved.trim() ? { path: saved, bookmark: null } : null
    }
    const record = saved as Record<string, unknown>
    if (typeof record?.path === 'string' && record.path.trim()) {
      return {
        path: record.path,
        bookmark:
          typeof record?.bookmark === 'string' && record.bookmark.trim() ? record.bookmark : null
      }
    }
    return null
  }

  async function loadLastExportFolder(): Promise<void> {
    if (!window.electronAPI?.loadAppSettings) return
    const result = await window.electronAPI.loadAppSettings()
    const saved = normalizeStoredExportFolder(
      (result?.settings as Record<string, unknown>)?.__lastExportFolder
    )
    if (saved) applyExportFolder(saved.path, saved.bookmark)
  }

  async function saveLastExportFolder(folderPath: string): Promise<void> {
    if (!window.electronAPI?.loadAppSettings || !window.electronAPI?.saveAppSettings) return
    const result = await window.electronAPI.loadAppSettings()
    const settings = {
      ...(result?.settings || {}),
      __lastExportFolder: {
        path: folderPath,
        bookmark: exportFolderBookmark || null
      }
    }
    await window.electronAPI.saveAppSettings(settings)
  }

  async function chooseExportFolder(): Promise<string | null> {
    if (!window.electronAPI?.chooseExportFolder) return null
    const result = await window.electronAPI.chooseExportFolder()
    if (typeof result === 'string') {
      applyExportFolder(result)
      await saveLastExportFolder(result)
    } else if (result && typeof result === 'object' && 'path' in result) {
      const folderResult = result as { path: string; bookmark?: string }
      applyExportFolder(folderResult.path, folderResult.bookmark || null)
      await saveLastExportFolder(folderResult.path)
      return folderResult.path
    }
    return null
  }

  function populateExportModal(): void {
    const strips = state.nestResult?.strips || []
    const sheet = state.sheets[0] || {}
    const isPreview = !!state.nestResult?.is_preview

    if (dom.exportSummarySheets) dom.exportSummarySheets.textContent = String(strips.length)
    const totalParts = strips.reduce((s: number, t: Strip) => s + (t.item_count || 0), 0)
    if (dom.exportSummaryParts) dom.exportSummaryParts.textContent = String(totalParts)

    const densities = strips
      .map((strip: Strip) => exportSheetDensityForStrip(strip, sheet))
      .filter((value: number) => Number.isFinite(value) && value > 0)

    const avgUtil = densities.length
      ? densities.reduce((sum: number, value: number) => sum + value, 0) / densities.length
      : null

    if (dom.exportSummaryUtil) {
      dom.exportSummaryUtil.textContent = Number.isFinite(avgUtil)
        ? `${(avgUtil! * 100).toFixed(1)}%`
        : '—'
    }

    const totalMm = strips.reduce(
      (sum: number, strip: Strip) => sum + exportSheetWidthForStrip(strip, sheet),
      0
    )
    if (dom.exportSummaryLength)
      dom.exportSummaryLength.textContent = `${(totalMm / 1000).toFixed(2)} m`

    if (dom.exportFolderLabel) {
      dom.exportFolderLabel.classList.remove('export-folder-success', 'export-folder-error')
      if (isPreview) {
        dom.exportFolderLabel.textContent = 'Waiting for final Sparrow result before export'
      }
    }

    if (dom.exportTableBody) {
      dom.exportTableBody.innerHTML = ''
      strips.forEach((strip: Strip, i: number) => {
        const w = roundUpDim(exportSheetWidthForStrip(strip, sheet))
        const h = roundUpDim(sheet.height || 0)
        const density = exportSheetDensityForStrip(strip, sheet)
        const pct = Number.isFinite(density) && density > 0 ? density * 100 : null
        const cls = Number.isFinite(pct) ? utilClass(pct!) : ''
        const tr = document.createElement('tr')
        tr.innerHTML = `
          <td><span class="export-sheet-num">${i + 1}</span></td>
          <td style="font-variant-numeric:tabular-nums">${h} × ${w}</td>
          <td style="color:var(--text-dim)">${sheet.material || '—'}</td>
          <td style="font-variant-numeric:tabular-nums">${strip.item_count || 0}</td>
          <td>
            <div class="export-util-bar-wrap">
              <div class="export-util-bar">
                <div class="export-util-fill ${cls}" style="width:${Number.isFinite(pct) ? Math.min(100, pct!).toFixed(1) : 0}%"></div>
              </div>
              <span class="export-util-pct">${Number.isFinite(pct) ? `${pct!.toFixed(1)}%` : '—'}</span>
            </div>
          </td>
          <td style="font-variant-numeric:tabular-nums;color:var(--text-dim)">${formatWidthMeters(exportSheetWidthForStrip(strip, sheet))}</td>`
        dom.exportTableBody.appendChild(tr)
      })
    }
  }

  function openExportModal(): void {
    if (!state.nestResult?.strips?.length) return
    populateExportModal()
    if (exportFolderPath && canExportFinalSheets()) {
      applyExportFolder(exportFolderPath)
    } else if (!state.nestResult?.is_preview && dom.exportFolderLabel) {
      dom.exportFolderLabel.textContent = 'No folder selected'
      dom.exportFolderLabel.classList.remove('export-folder-success', 'export-folder-error')
    }

    if (dom.exportDXFBtn) {
      dom.exportDXFBtn.disabled = !exportFolderPath || !canExportFinalSheets()
      dom.exportDXFBtn.textContent = 'Export DXF'
    }

    if (dom.exportModal) {
      dom.exportModal.classList.add('open')
    }
  }

  function syncExportButton(): void {
    if (dom.openExportBtn) {
      dom.openExportBtn.disabled = !state.nestResult?.strips?.length
    }
  }

  function bind(): void {
    dom.openExportBtn?.addEventListener('click', openExportModal)
    dom.exportClose?.addEventListener('click', () => dom.exportModal.classList.remove('open'))
    dom.exportCancel?.addEventListener('click', () => dom.exportModal.classList.remove('open'))
    dom.exportModal?.addEventListener('click', (e: Event) => {
      if (e.target === dom.exportModal) dom.exportModal.classList.remove('open')
    })

    dom.exportChooseFolder?.addEventListener('click', async () => {
      await chooseExportFolder()
    })

    dom.exportDXFBtn?.addEventListener('click', async () => {
      if (!canExportFinalSheets()) return
      if (!exportFolderPath) {
        const chosenFolder = await chooseExportFolder()
        if (!chosenFolder) return
      }

      if (dom.exportDXFBtn) {
        dom.exportDXFBtn.disabled = true
        dom.exportDXFBtn.textContent = 'Exporting…'
      }

      if (dom.exportFolderLabel) {
        dom.exportFolderLabel.classList.remove('export-folder-success', 'export-folder-error')
      }

      try {
        const sheet = state.sheets[0] || {}
        const strips = state.nestResult?.strips?.map((strip: Strip) => ({
          index: strip.index,
          json_path: strip.json_path,
          strip_width: strip.strip_width,
          strip_height: sheet.height || 0,
          sheet_width: exportSheetWidthForStrip(strip, sheet),
          sheet_width_mode: sheet.widthMode || 'fixed',
          density: strip.density,
          item_count: strip.item_count
        }))

        const result = await window.electronAPI.exportSheetsDXF({
          outputDir: exportFolderPath!,
          outputDirBookmark: exportFolderBookmark || null,
          jobName: state.nestResult?.name || 'nesting-job',
          inputPath: state.nestInputPath || null,
          settings:
            typeof getCurrentNestingSettings === 'function' ? getCurrentNestingSettings() : {},
          exportItems: state.lastPlacementExportItems || {},
          strips: strips || [],
          sheets: strips || []
        })

        if (!result?.success) throw new Error(result?.error || 'Export failed')

        if (dom.exportDXFBtn) {
          dom.exportDXFBtn.textContent = '✓ Exported'
          dom.exportDXFBtn.classList.add('btn-success')
        }

        if (dom.exportFolderLabel) {
          const fileCount = Array.isArray(result.files) ? result.files.length : strips?.length || 0
          dom.exportFolderLabel.textContent = `${fileCount} file${fileCount !== 1 ? 's' : ''} saved to ${shortPath(exportFolderPath)}`
          dom.exportFolderLabel.classList.add('export-folder-success')
        }

        setTimeout(() => {
          if (dom.exportDXFBtn) {
            dom.exportDXFBtn.textContent = 'Export DXF'
            dom.exportDXFBtn.classList.remove('btn-success')
            dom.exportDXFBtn.disabled = false
          }
        }, 3000)
      } catch (err) {
        console.error('[Export DXF]', err)
        if (dom.exportDXFBtn) {
          dom.exportDXFBtn.textContent = 'Export DXF'
          dom.exportDXFBtn.disabled = false
        }
        if (dom.exportFolderLabel) {
          dom.exportFolderLabel.textContent = `Error: ${(err as Error).message}`
          dom.exportFolderLabel.classList.add('export-folder-error')
        }
      }
    })
  }

  return {
    loadLastExportFolder,
    syncExportButton,
    bind
  }
}
