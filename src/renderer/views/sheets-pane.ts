import type { AppState } from '../state/store'
import type { NestSheet } from '../../types/dxf-types'

interface SheetsPaneDOMRefs {
  sheetList: HTMLElement | null
  addSheetBtn: HTMLButtonElement | null
}

interface SheetsPaneDeps {
  state: AppState
  dom: SheetsPaneDOMRefs
  schedulePersistJobState: () => void
  getOpenSheetEditor: () => ((id: string | null) => void) | null
  renderTabs: () => void
}

export interface SheetsPaneAPI {
  renderSheets: () => void
  bind: () => void
}

export function createSheetsPane({
  state,
  dom,
  schedulePersistJobState,
  getOpenSheetEditor,
  renderTabs
}: SheetsPaneDeps): SheetsPaneAPI {
  function renderSheets(): void {
    if (!dom.sheetList) return
    dom.sheetList.innerHTML = ''
    if (dom.addSheetBtn) {
      const allowAnotherSheet = state.sheets.length === 0
      dom.addSheetBtn.style.visibility = allowAnotherSheet ? 'visible' : 'hidden'
      dom.addSheetBtn.disabled = !allowAnotherSheet
    }
    state.sheets.forEach((s: NestSheet) => {
      const widthLabel =
        s.widthMode === 'unlimited' ? `${s.height} × Unlimited mm` : `${s.height} × ${s.width} mm`
      const modeLabel =
        s.widthMode === 'unlimited'
          ? 'Auto sheets · continuous strip'
          : s.widthMode === 'max'
            ? 'Auto sheets · length capped'
            : 'Auto sheets · fixed size'
      const li = document.createElement('li')
      li.className = 'sheet-item'
      li.innerHTML = `
        <div class="sheet-icon">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="#4fcf8e" stroke-width="1.5"/>
          </svg>
        </div>
        <div class="sheet-info">
          <div class="sheet-dims">${widthLabel}</div>
          <div class="sheet-material">${s.material || 'No material'} · ${modeLabel}</div>
        </div>
        <button class="file-remove" data-id="${s.id}" title="Remove">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M9 1L1 9M1 1l8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>`
      li.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.file-remove')) return
        const openSheetEditor = getOpenSheetEditor()
        if (openSheetEditor) openSheetEditor(s.id)
      })
      if (!dom.sheetList) return
      dom.sheetList.appendChild(li)
    })
    dom.sheetList.querySelectorAll('.file-remove').forEach((btn: Element) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const buttonEl = btn as HTMLButtonElement
        state.sheets = state.sheets.filter((x: NestSheet) => x.id !== buttonEl.dataset.id)
        renderSheets()
        renderTabs()
        schedulePersistJobState()
      })
    })
    renderTabs()
  }

  function bind(): void {
    dom.addSheetBtn?.addEventListener('click', () => {
      const openSheetEditor = getOpenSheetEditor()
      if (openSheetEditor) openSheetEditor(null)
    })
  }

  return { renderSheets, bind }
}
