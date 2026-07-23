import { uid, formatBytes, effectiveFileQty } from '../helpers'

export function createFilesPane(deps: {
  state: any
  dom: any
  schedulePersistJobState: () => void
  hydrateFileShapesForList: (file: any, cb: () => void) => void
}) {
  const { state, dom, schedulePersistJobState, hydrateFileShapesForList } = deps

  // Rebuilds the DXF files sidebar so it matches current state.
  // Shows each file's shape count, size, and total qty, wires up the ✕ remove buttons,
  // and disables the Clear button when the list is empty.
  function renderFiles() {
    dom.fileList.innerHTML = ''
    if (dom.clearFilesBtn) dom.clearFilesBtn.disabled = state.files.length === 0
    state.files.forEach((f: any) => {
      const shapeCount = Array.isArray(f.shapes)
        ? f.shapes.filter((shape: any) => shape.visible !== false).length
        : 0
      const shapeLabel = `${shapeCount} shape${shapeCount === 1 ? '' : 's'}`
      const li = document.createElement('li')
      li.className = 'file-item'
      li.innerHTML = `
        <div class="file-icon">DXF</div>
        <div class="file-info">
          <div class="file-name" title="${f.name}">${f.name}</div>
          <div class="file-size">${shapeLabel} · ${formatBytes(f.size)}</div>
        </div>
        <div class="file-qty-total">${effectiveFileQty(f)}</div>
        <button class="file-remove" data-id="${f.id}" title="Remove">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M9 1L1 9M1 1l8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>`
      li.addEventListener('click', e => {
        if (!(e.target as HTMLElement).closest('.file-remove')) {
          if ((window as any).openDXFPreview) (window as any).openDXFPreview(f.id, f.name)
        }
      })

      dom.fileList.appendChild(li)
    })

    dom.fileList.querySelectorAll('.file-remove').forEach((btn: any) => {
      btn.addEventListener('click', (e: Event) => {
        e.stopPropagation()
        state.files = state.files.filter((x: any) => x.id !== btn.dataset.id)
        renderFiles()
        schedulePersistJobState()
      })
    })

    dom.dropZone.style.display = 'flex'
  }

  // Accepts an array of file objects and adds them to state, skipping duplicates by name.
  // Kicks off background DXF parsing for each new file so shapes are ready before the user runs nesting.
  function addFiles(fileObjs: any[]) {
    const newlyAdded: any[] = []
    fileObjs.forEach(f => {
      if (!state.files.find((x: any) => x.name === f.name)) {
        const file = {
          id: uid(),
          name: f.name,
          size: f.size || 0,
          path: f.path || null,
          bookmark: f.bookmark || null,
          qty: 1,
        }
        state.files.push(file)
        newlyAdded.push(file)
      }
    })
    renderFiles()
    schedulePersistJobState()
    newlyAdded.forEach(file => {
      void hydrateFileShapesForList(file, () => {
        renderFiles()
        schedulePersistJobState()
      })
    })
  }

  // Removes a single file from state by its ID and refreshes the list.
  // Returns true when a file was actually found and removed, so callers can decide whether to persist.
  function removeJobFileById(fileId: string): boolean {
    if (!fileId) return false
    const before = state.files.length
    state.files = state.files.filter((file: any) => file.id !== fileId)
    if (state.files.length !== before) {
      renderFiles()
      return true
    }
    return false
  }

  // Wires the Clear-all button and the Add-file button to their respective actions.
  // In Electron the Add-file button opens the native file picker; in the browser it loads three demo files.
  function bind() {
    dom.clearFilesBtn?.addEventListener('click', () => {
      if (!state.files.length) return
      state.files = []
      renderFiles()
      schedulePersistJobState()
    })

    dom.addFileBtn.addEventListener('click', async () => {
      if ((window as any).electronAPI) {
        const files = await (window as any).electronAPI.openFileDialog()
        addFiles(files)
      } else {
        addFiles([
          { name: 'bracket_L.dxf', size: 14200 },
          { name: 'panel_A.dxf', size: 28400 },
          { name: 'gusset_01.dxf', size: 9100 },
        ])
      }
    })
  }

  return {
    renderFiles,
    addFiles,
    removeJobFileById,
    bind,
  }
}
