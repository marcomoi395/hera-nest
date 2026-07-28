import { f, f1 } from '../utils/dxf-svg'
import type { DxfPreviewShape, DxfLayer } from '../../types/dxf-types'

export function createDxfPreviewShapesListView(deps: {
  pv: {
    shapes: DxfPreviewShape[]
    layers: DxfLayer[]
    selectedId?: string | null
  }
  getShapesList: () => HTMLElement | null
  getShapeCount: () => HTMLElement | null
  getFileMeta: () => HTMLElement | null
  getStats: () => HTMLElement | null
  syncActions: () => void
}): {
  renderList: (params: {
    onSelectShape: (id: string) => void
    onChangeQty: (id: string, delta: number) => void
    onSetQty: (id: string, value: string) => void
    onRestoreShape: (id: string) => void
  }) => void
} {
  const { pv, getShapesList, getShapeCount, getFileMeta, getStats, syncActions } = deps

  function renderList({
    onSelectShape,
    onChangeQty,
    onSetQty,
    onRestoreShape
  }: {
    onSelectShape: (id: string) => void
    onChangeQty: (id: string, delta: number) => void
    onSetQty: (id: string, value: string) => void
    onRestoreShape: (id: string) => void
  }): void {
    const visible = pv.shapes.filter((shape: Record<string, unknown>) => shape.visible)
    const total = visible.reduce(
      (acc: number, shape: Record<string, unknown>) => acc + (shape.qty as number),
      0
    )
    const shapeCountEl = getShapeCount()
    if (shapeCountEl) shapeCountEl.textContent = `${visible.length}/${pv.shapes.length}`
    const fileMetaEl = getFileMeta()
    if (fileMetaEl)
      fileMetaEl.textContent = `${pv.shapes.length} shape${pv.shapes.length !== 1 ? 's' : ''} · ${pv.layers.length} layer${pv.layers.length !== 1 ? 's' : ''}`
    const statsEl = getStats()
    if (statsEl) statsEl.textContent = `${total} piece${total !== 1 ? 's' : ''} queued for nesting`

    const listEl = getShapesList()
    if (!listEl) return
    listEl.innerHTML = ''
    const layerOrder = pv.layers.map((layer: DxfLayer) => layer.name as string)
    const grouped = [...pv.shapes].sort((a, b) => {
      const layerCmp = layerOrder.indexOf(a.layer as string) - layerOrder.indexOf(b.layer as string)
      if (layerCmp !== 0) return layerCmp
      if ((a.visible !== false) !== (b.visible !== false)) return a.visible === false ? 1 : -1
      return ((a.name as string) || '').localeCompare((b.name as string) || '')
    })

    let lastLayer: string | null = null
    grouped.forEach((shape) => {
      if (shape.layer !== lastLayer) {
        lastLayer = (shape.layer ?? null) as string | null
        const color =
          (pv.layers.find((layer: DxfLayer) => (layer.name as string) === shape.layer) || {})
            .color || '#888'
        const header = document.createElement('div')
        header.className = 'shapes-group-hdr'
        header.innerHTML = `<span class="layer-dot" style="background:${color}"></span>${shape.layer}`
        listEl.appendChild(header)
      }

      // Skip shapes without bbox
      if (!shape.bbox) return

      const scale = Math.min(40 / shape.bbox.w, 30 / shape.bbox.h) * 0.9
      const thumbWidth = f(shape.bbox.w * scale)
      const thumbHeight = f(shape.bbox.h * scale)
      const scaledDecor = (shape.decorSVG || [])
        .map((svg: string) =>
          svg.replace(
            /stroke-width="([^"]+)"/g,
            (_, value) => `stroke-width="${f(+value / scale)}"`
          )
        )
        .join('')
      const scaledBoundary = (shape.outerBoundaryItems || [])
        .map((item: Record<string, unknown>) =>
          (item.svg as string).replace(
            /stroke-width="([^"]+)"/g,
            (_, value) => `stroke-width="${f(+value / scale)}"`
          )
        )
        .join('')
      const thumb = `<svg viewBox="0 0 ${f(shape.bbox.w)} ${f(shape.bbox.h)}" width="${thumbWidth}" height="${thumbHeight}">
        ${!shape.hasSyntheticOuter && !shape.mixedOuterLayers ? `<path d="${shape.pathData}" fill="${shape.layerColor}" fill-opacity="${shape.selectionFillAllowed ? (shape.mixedOuterLayers ? '1' : '0.18') : '0'}" fill-rule="${shape.fillRule}" stroke="${shape.layerColor}" stroke-width="${f(1.6 / scale)}" stroke-linejoin="round"/>` : ''}
        ${scaledBoundary}
        ${scaledDecor}
      </svg>`

      const row = document.createElement('div')
      row.className = `pvw-shape-row${shape.id === pv.selectedId ? ' selected' : ''}${shape.visible === false ? ' dimmed' : ''}`
      row.dataset.id = shape.id
      row.innerHTML = `
        <div class="pvw-thumb">${thumb}</div>
        <div class="pvw-info">
          <div class="pvw-name">${shape.name}</div>
          <div class="pvw-dims">${f1(shape.bbox.w)} × ${f1(shape.bbox.h)} mm${shape.visible === false ? ' · removed' : ''}</div>
        </div>
        <div class="pvw-controls">
          ${
            shape.visible === false
              ? `<button class="qty-btn pvw-restore" data-id="${shape.id}" title="Restore shape">↺</button>`
              : `<button class="qty-btn pvw-dec" data-id="${shape.id}">−</button>
               <input class="qty-value qty-input pvw-qty-input" data-id="${shape.id}" type="number" min="1" step="1" value="${shape.qty}" aria-label="Quantity for ${shape.name}">
               <button class="qty-btn pvw-inc" data-id="${shape.id}">+</button>`
          }
        </div>`
      row.addEventListener('click', (event) => {
        if (!(event.target as HTMLElement).closest('.pvw-controls'))
          onSelectShape(shape.id as string)
      })
      listEl.appendChild(row)
    })

    listEl.querySelectorAll('.pvw-dec').forEach((button: Element) => {
      const btnEl = button as HTMLElement
      btnEl.addEventListener('click', (event: Event) => {
        event.stopPropagation()
        if (btnEl.dataset.id) onChangeQty(btnEl.dataset.id, -1)
      })
    })
    listEl.querySelectorAll('.pvw-inc').forEach((button: Element) => {
      const btnEl = button as HTMLElement
      btnEl.addEventListener('click', (event: Event) => {
        event.stopPropagation()
        if (btnEl.dataset.id) onChangeQty(btnEl.dataset.id, 1)
      })
    })
    listEl.querySelectorAll('.pvw-qty-input').forEach((input: Element) => {
      const inputEl = input as HTMLInputElement
      inputEl.addEventListener('click', (event: Event) => event.stopPropagation())
      inputEl.addEventListener('keydown', (event: KeyboardEvent) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          if (inputEl.dataset.id) onSetQty(inputEl.dataset.id, inputEl.value)
        }
      })
      inputEl.addEventListener('blur', () => {
        if (inputEl.dataset.id) onSetQty(inputEl.dataset.id, inputEl.value)
      })
    })
    listEl.querySelectorAll('.pvw-restore').forEach((button: Element) => {
      const btnEl = button as HTMLElement
      btnEl.addEventListener('click', (event: Event) => {
        event.stopPropagation()
        if (btnEl.dataset.id) onRestoreShape(btnEl.dataset.id)
      })
    })
    syncActions()
  }

  return { renderList }
}
