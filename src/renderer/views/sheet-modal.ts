import { uid } from '../helpers'

export function createSheetModal(deps: {
  state: any
  dom: any
  schedulePersistJobState: () => void
  renderSheets: () => void
}) {
  const { state, dom, schedulePersistJobState, renderSheets } = deps

  function presetMatches(btn: HTMLElement): boolean {
    return (
      dom.sheetWidthMode.value === 'fixed' &&
      String(dom.sheetWidth.value) === String(btn.dataset.w) &&
      String(dom.sheetHeight.value) === String(btn.dataset.h)
    )
  }

  function syncSheetPresetButtons(): void {
    document.querySelectorAll('.preset-btn').forEach((btn: any) => {
      btn.classList.toggle('active', presetMatches(btn))
    })
  }

  function resetSheetForm(): void {
    state.editingSheetId = null
    dom.sheetWidthMode.value = 'fixed'
    if (typeof dom.sheetWidthMode._syncCustomSelect === 'function') dom.sheetWidthMode._syncCustomSelect()
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

    const sheet = state.sheets.find((entry: any) => entry.id === sheetId)
    if (!sheet) return

    state.editingSheetId = sheet.id
    dom.sheetWidthMode.value = sheet.widthMode || 'fixed'
    if (typeof dom.sheetWidthMode._syncCustomSelect === 'function') dom.sheetWidthMode._syncCustomSelect()
    dom.sheetHeight.value = sheet.height ?? 1250
    dom.sheetWidth.value = sheet.width ?? 3000
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
      dom.sheetModeHelp.textContent = 'Length is treated as a maximum. The algorithm may use less length when possible and will automatically calculate the number of sheets needed and their dimensions.'
    } else {
      dom.sheetModeHelp.textContent = 'A fixed sheet size will be used. The number of sheets required is calculated automatically.'
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
        const sheet = state.sheets.find((s: any) => s.id === state.editingSheetId)
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
    document.querySelectorAll('.preset-btn').forEach((btn: any) => {
      btn.addEventListener('click', () => {
        dom.sheetWidthMode.value = 'fixed'
        if (typeof dom.sheetWidthMode._syncCustomSelect === 'function') dom.sheetWidthMode._syncCustomSelect()
        dom.sheetWidth.value = btn.dataset.w
        dom.sheetHeight.value = btn.dataset.h
        updateSheetModeControls()
        syncSheetPresetButtons()
      })
    })
  }

  return {
    openSheetEditor,
    closeSheetDialog,
    updateSheetModeControls,
    bind,
  }
}
