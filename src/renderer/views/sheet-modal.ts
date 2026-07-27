import type { AppState } from '../state/store'
import type { NestSheet } from '../../types/dxf-types'

import { uid } from '../helpers'

interface SheetModalDOMRefs {
  sheetModal: HTMLElement
  sheetWidthMode: HTMLSelectElement & { _syncCustomSelect?: () => void }
  sheetWidth: HTMLInputElement
  sheetHeight: HTMLInputElement
  sheetMaterial: HTMLInputElement
  confirmSheet: HTMLButtonElement
  closeSheet: HTMLButtonElement | null
  cancelSheet: HTMLButtonElement | null
  sheetModeHelp: HTMLElement
  [key: string]: unknown
}
export interface SheetModalDeps {
  state: AppState
  dom: SheetModalDOMRefs
  schedulePersistJobState: () => void
  renderSheets: () => void
}

export interface SheetModalApi {
  openSheetEditor: (sheetId?: string | null) => void
  closeSheetDialog: () => void
  updateSheetModeControls: () => void
  bind: () => void
}

export function createSheetModal(deps: {
  state: AppState
  dom: SheetModalDOMRefs
  schedulePersistJobState: () => void
  renderSheets: () => void
}): SheetModalApi {
  const { state, dom, schedulePersistJobState, renderSheets } = deps

  function presetMatches(btn: HTMLElement): boolean {
    return (
      dom.sheetWidthMode.value === 'fixed' &&
      String(dom.sheetWidth.value) === String(btn.dataset.w) &&
      String(dom.sheetHeight.value) === String(btn.dataset.h)
    )
  }

  function syncSheetPresetButtons(): void {
    document.querySelectorAll<HTMLElement>('.preset-btn').forEach((btn) => {
      btn.classList.toggle('active', presetMatches(btn))
    })
  }

  function resetSheetForm(): void {
    state.editingSheetId = null
    dom.sheetWidthMode.value = 'fixed'
    if (typeof dom.sheetWidthMode._syncCustomSelect === 'function')
      dom.sheetWidthMode._syncCustomSelect()
    dom.sheetHeight.value = '1250'
    dom.sheetWidth.value = '3000'
    dom.sheetMaterial.value = ''
    dom.confirmSheet.textContent = 'Add Sheet'
    updateSheetModeControls()
  }

  function openSheetEditor(sheetId: string | null = null): void {
    if (!sheetId) {
      if (state.sheets.length >= 1) return
      resetSheetForm()
      dom.sheetModal.classList.add('open')
      return
    }

    const sheet = state.sheets.find((entry: NestSheet) => entry.id === sheetId)
    if (!sheet) return

    state.editingSheetId = sheet.id
    dom.sheetWidthMode.value = sheet.widthMode || 'fixed'
    if (typeof dom.sheetWidthMode._syncCustomSelect === 'function')
      dom.sheetWidthMode._syncCustomSelect()
    dom.sheetHeight.value = String(sheet.height ?? 1250)
    dom.sheetWidth.value = String(sheet.width ?? 3000)
    dom.sheetMaterial.value = sheet.material || ''
    dom.confirmSheet.textContent = 'Save Sheet'
    updateSheetModeControls()
    dom.sheetModal.classList.add('open')
  }

  function closeSheetDialog(): void {
    dom.sheetModal.classList.remove('open')
    resetSheetForm()
  }

  function updateSheetModeControls(): void {
    const mode = dom.sheetWidthMode.value
    const unlimited = mode === 'unlimited'

    dom.sheetWidth.disabled = unlimited

    if (unlimited) {
      dom.sheetModeHelp.textContent = 'The strip can continue without a fixed length limit.'
    } else if (mode === 'max') {
      dom.sheetModeHelp.textContent =
        'Length is treated as a maximum. The algorithm may use less length when possible and will automatically calculate the number of sheets needed and their dimensions.'
    } else {
      dom.sheetModeHelp.textContent =
        'A fixed sheet size will be used. The number of sheets required is calculated automatically.'
    }

    syncSheetPresetButtons()
  }

  function bind(): void {
    dom.closeSheet?.addEventListener('click', closeSheetDialog)
    dom.cancelSheet?.addEventListener('click', closeSheetDialog)
    dom.confirmSheet?.addEventListener('click', () => {
      const width = parseFloat(dom.sheetWidth.value) || 3000
      const height = parseFloat(dom.sheetHeight.value) || 1250
      const material = (dom.sheetMaterial.value || '').trim()
      const widthMode = dom.sheetWidthMode.value || 'fixed'
      if (state.editingSheetId) {
        const sheet = state.sheets.find((s: NestSheet) => s.id === state.editingSheetId)
        if (sheet) {
          sheet.width = width
          sheet.height = height
          sheet.material = material
          sheet.widthMode = widthMode
        }
      } else {
        state.sheets.push({ id: uid(), width, height, material, widthMode })
      }
      closeSheetDialog()
      renderSheets()
      schedulePersistJobState()
    })
    dom.sheetWidthMode?.addEventListener('change', updateSheetModeControls)
    document.querySelectorAll<HTMLElement>('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        dom.sheetWidthMode.value = 'fixed'
        if (typeof dom.sheetWidthMode._syncCustomSelect === 'function')
          dom.sheetWidthMode._syncCustomSelect()
        dom.sheetWidth.value = btn.dataset.w!
        dom.sheetHeight.value = btn.dataset.h!
        updateSheetModeControls()
        syncSheetPresetButtons()
      })
    })
  }

  return {
    openSheetEditor,
    closeSheetDialog,
    updateSheetModeControls,
    bind
  }
}
