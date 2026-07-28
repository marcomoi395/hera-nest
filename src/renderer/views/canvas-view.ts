import { formatWidthMeters } from '../helpers'
import type { AppState } from '../state/store'
import type { Strip, NestSheet } from '../../types/dxf-types'
type CanvasViewState = AppState
interface CanvasViewDOMRefs {
  canvas?: HTMLCanvasElement
  tabsContainer?: HTMLElement
  canvasTabs?: HTMLElement
  viewport?: HTMLElement
  svgContainer?: HTMLElement
  nestStats?: HTMLElement
  emptyState?: HTMLElement
  zoomLabel?: HTMLElement
  zoomIn?: HTMLElement
  zoomOut?: HTMLElement
  fitView?: HTMLElement
}

export interface CanvasViewApi {
  renderTabs: () => void
  showNestResult: (sheetIndex?: number) => void
  applyZoom: (skipSaveZoom?: boolean) => void
  bind: () => void
}

export function createCanvasView(deps: {
  state: CanvasViewState
  dom: CanvasViewDOMRefs
  setNestStatsTone: (tone: string) => void
  syncViewportEmptyState: (isEmpty: boolean) => void
}): CanvasViewApi {
  const { state, dom, setNestStatsTone, syncViewportEmptyState } = deps

  const FIT_INSET_X = 40
  const FIT_INSET_Y = 28
  const SVG_PREVIEW_MARGIN_X = 80
  const SVG_PREVIEW_MARGIN_Y = 24
  let lastRenderedSvg = ''

  function currentSheetConfig(): NestSheet {
    return (state.sheets[0] || {}) as NestSheet
  }

  function displayStripWidth(strip: Strip, sheet: NestSheet = currentSheetConfig()): number {
    if (sheet?.widthMode === 'fixed') {
      const configuredWidth = Number(sheet?.width)
      if (Number.isFinite(configuredWidth) && configuredWidth > 0) return configuredWidth
    }
    return Number(strip?.strip_width) || 0
  }

  function displayStripDensity(
    strip: Strip,
    sheet: NestSheet = currentSheetConfig()
  ): number | null {
    if (!strip) return null
    const rawDensity = Number(strip?.density)
    if (!Number.isFinite(rawDensity)) return null

    const rawWidth = Number(strip?.strip_width)
    const rawHeight = Number(strip?.strip_height) || Number(sheet?.height)
    const targetWidth = displayStripWidth(strip, sheet)

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

  function parseRectPathData(pathData: string): {
    x0: number
    y0: number
    x1: number
    y1: number
    x2: number
    y2: number
    x3: number
    y3: number
  } | null {
    const match =
      /^M([-\d.]+),([-\d.]+) L([-\d.]+),([-\d.]+) L([-\d.]+),([-\d.]+) L([-\d.]+),([-\d.]+) z$/i.exec(
        (pathData || '').trim()
      )
    if (!match) return null
    return {
      x0: Number(match[1]),
      y0: Number(match[2]),
      x1: Number(match[3]),
      y1: Number(match[4]),
      x2: Number(match[5]),
      y2: Number(match[6]),
      x3: Number(match[7]),
      y3: Number(match[8])
    }
  }

  function formatRectPathData(x: number, y: number, width: number, height: number): string {
    return `M${x},${y} L${x + width},${y} L${x + width},${y + height} L${x},${y + height} z`
  }

  function adjustSvgForFixedWidth(svg: string, strip: Strip, targetWidth: number): string {
    if (!svg || !Number.isFinite(targetWidth) || targetWidth <= 0) return svg

    const parser = new DOMParser()
    const doc = parser.parseFromString(svg, 'image/svg+xml')
    const root = doc.documentElement
    if (!root || root.nodeName.toLowerCase() !== 'svg') return svg

    const viewBoxParts = (root.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number)
    const vb = {
      x: viewBoxParts[0] || 0,
      y: viewBoxParts[1] || 0,
      w: viewBoxParts[2] || 0,
      h: viewBoxParts[3] || 0
    }
    if (!Number.isFinite(vb.w) || vb.w <= 0) return svg

    const previewMinX = -SVG_PREVIEW_MARGIN_X
    const previewMinY = vb.y - SVG_PREVIEW_MARGIN_Y
    const previewWidth = targetWidth + SVG_PREVIEW_MARGIN_X * 2
    const previewHeight = vb.h + SVG_PREVIEW_MARGIN_Y * 2

    root.setAttribute('viewBox', `${previewMinX} ${previewMinY} ${previewWidth} ${previewHeight}`)
    root.setAttribute('width', `${previewWidth}`)

    const sourceWidth = Number(strip?.strip_width) || vb.w
    const frameOriginX = 0
    const frameGroups = Array.from(root.querySelectorAll('g[id^="container_"]'))
    let normalizedAnyFrame = false
    frameGroups.forEach((group) => {
      const framePath = group.querySelector('path')
      if (!framePath) return
      const rect = parseRectPathData(framePath.getAttribute('d') || '')
      if (!rect) return
      const width = rect.x1 - rect.x0
      const height = rect.y2 - rect.y1
      if (!Number.isFinite(width) || !Number.isFinite(height)) return
      if (Math.abs(width - sourceWidth) > 0.1) return
      framePath.setAttribute('d', formatRectPathData(frameOriginX, rect.y0, targetWidth, height))
      normalizedAnyFrame = true

      const title = group.querySelector('title')
      if (title && title.textContent) {
        title.textContent = title.textContent.replace(
          /bbox:\s*\[x_min:\s*[-\d.]+,\s*y_min:\s*[-\d.]+,\s*x_max:\s*[-\d.]+,\s*y_max:\s*[-\d.]+\]/i,
          `bbox: [x_min: ${frameOriginX.toFixed(3)}, y_min: ${rect.y0.toFixed(3)}, x_max: ${(frameOriginX + targetWidth).toFixed(3)}, y_max: ${(rect.y0 + height).toFixed(3)}]`
        )
      }
    })

    const dashedOutline = root.querySelector('#highlight_cd_shapes > path:last-of-type')
    if (dashedOutline) {
      const rect = parseRectPathData(dashedOutline.getAttribute('d') || '')
      if (rect) {
        const width = rect.x1 - rect.x0
        const height = rect.y2 - rect.y1
        if (
          Number.isFinite(width) &&
          Number.isFinite(height) &&
          (Math.abs(width - sourceWidth) <= 0.1 || normalizedAnyFrame)
        ) {
          dashedOutline.setAttribute('d', formatRectPathData(0, rect.y0, targetWidth, height))
        }
      }
    }

    const serializer = new XMLSerializer()
    return serializer.serializeToString(root)
  }

  function styleStripSVG(svg: string, strip: Strip | null = null): string {
    if (!svg) return ''

    let styled = svg
    styled = styled.replace(/<g\b[^>]*id="collision_lines"[^>]*>[\s\S]*?<\/g>/gi, '')
    const sheet = currentSheetConfig()
    const targetWidth = strip ? displayStripWidth(strip, sheet) : null
    if (targetWidth) {
      styled = adjustSvgForFixedWidth(styled, strip!, targetWidth)
    }
    const viewBoxMatch = styled.match(/viewBox="([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)"/i)
    const vb = viewBoxMatch
      ? {
          x: Number(viewBoxMatch[1]),
          y: Number(viewBoxMatch[2]),
          w: Number(viewBoxMatch[3]),
          h: Number(viewBoxMatch[4])
        }
      : { x: 0, y: 0, w: 3000, h: 1250 }

    const bgMarkup = `
<defs>
<pattern id="nestGrid" width="40" height="40" patternUnits="userSpaceOnUse">
<path d="M40 0 L0 0 0 40" fill="none" stroke="#1b1f2b" stroke-width="0.8"/>
</pattern>
<filter id="partGlow" x="-4%" y="-4%" width="108%" height="108%">
<feGaussianBlur stdDeviation="${vb.w * 0.0015}" result="blur"/>
<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
</defs>`

    styled = styled.replace(/<svg([^>]*)>/i, `<svg$1>\n${bgMarkup}`)
    styled = styled.replace(
      /fill="#D3D3D3"\s+stroke="black"\s+stroke-width="([\d.]+)"/gi,
      (_, sw) => `fill="url(#nestGrid)" stroke="#2e3550" stroke-width="${sw}"`
    )
    styled = styled.replace(
      /fill="#7A7A7A"\s+fill-opacity="0\.5"\s+fill-rule="nonzero"\s+stroke="black"\s+stroke-width="([\d.]+)"/gi,
      (_, sw) =>
        `fill="#1a2744" fill-opacity="1" fill-rule="nonzero" stroke="#4f8ef7" stroke-width="${(Number(sw) * 0.7).toFixed(4)}" filter="url(#partGlow)"`
    )
    styled = styled.replace(
      /fill="none"\s+stroke="black"\s+stroke-dasharray="([^"]+)"\s+stroke-linecap="([^"]+)"\s+stroke-linejoin="([^"]+)"\s+stroke-opacity="0\.3"\s+stroke-width="([\d.]+)"/gi,
      (_, da, lc, lj, sw) =>
        `fill="none" stroke="#3a5080" stroke-dasharray="${da}" stroke-linecap="${lc}" stroke-linejoin="${lj}" stroke-opacity="0.35" stroke-width="${(Number(sw) * 0.6).toFixed(4)}"`
    )
    styled = styled.replace(/stroke="black"/gi, 'stroke="#2e3550"')
    styled = styled.replace(/<text[^>]*>[\s\S]*?h:[\s\S]*?<\/text>/gi, '')
    return styled
  }

  function renderTabs(): void {
    if (!state.nestResult?.strips?.length) {
      ;(dom.canvasTabs as HTMLElement).innerHTML = ''
      return
    }

    const stripCount = state.nestResult.strips.length
    const activeIndex = Math.min(state.activeStripIndex || 0, Math.max(0, stripCount - 1))
    state.activeStripIndex = activeIndex

    const existing = Array.from(
      (dom.canvasTabs as HTMLElement).querySelectorAll('.canvas-tab')
    ) as HTMLButtonElement[]
    const initialCount = existing.length

    for (let i = initialCount; i < stripCount; i++) {
      const btn: HTMLButtonElement = document.createElement('button')
      btn.className = 'canvas-tab'
      btn.textContent = `Sheet ${i + 1}`
      btn.addEventListener('click', () => {
        const tabs = dom.canvasTabs as HTMLElement
        tabs.querySelectorAll('.canvas-tab').forEach((b: Element) => b.classList.remove('active'))
        btn.classList.add('active')
        state.activeStripIndex = i
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
        showNestResult(i)
      })
      ;(dom.canvasTabs as HTMLElement).appendChild(btn)
      existing.push(btn)
    }
    while (existing.length > stripCount) {
      const btn = existing.pop()
      if (btn) btn.remove()
    }

    existing.forEach((btn, i) => {
      btn.classList.toggle('active', i === activeIndex)
    })

    const countGrew = stripCount > initialCount
    if (countGrew) {
      requestAnimationFrame(() => {
        existing[activeIndex]?.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest'
        })
      })
    }
  }

  function showNestResult(sheetIndex?: number): void {
    const actualIndex = sheetIndex ?? state.activeStripIndex ?? 0
    const strip = state.nestResult?.strips?.[actualIndex] || null
    if (strip?.svg) {
      const sheet = currentSheetConfig()
      state.activeStripIndex = actualIndex
      const styled = styleStripSVG(strip.svg, strip)
      const previousIndex = dom.svgContainer?.dataset.activeIndex
      const sameStrip = previousIndex === String(actualIndex)
      const sameSvg = sameStrip && lastRenderedSvg === styled
      if (!sameSvg && dom.svgContainer) {
        dom.svgContainer.innerHTML = styled
        lastRenderedSvg = styled
      }
      if (dom.svgContainer) dom.svgContainer.style.display = 'grid'
      if (dom.emptyState) dom.emptyState.style.display = 'none'
      syncViewportEmptyState(false)
      const placed = Number(strip.item_count) || 0
      const densityValue = displayStripDensity(strip, sheet)
      const density = Number.isFinite(densityValue) ? `${(densityValue! * 100).toFixed(1)}%` : null
      const usedWidth = formatWidthMeters(displayStripWidth(strip, sheet))
      const previewPrefix = strip.is_preview || state.nestResult?.is_preview ? 'Preview · ' : ''
      setNestStatsTone('')
      const partsText = placed > 0 ? ` · ${placed} parts` : ''
      const utilText = density ? ` · Utilization: ${density}` : ''
      if (dom.nestStats) {
        dom.nestStats.textContent = `${previewPrefix}Sheet ${actualIndex + 1} of ${state.nestResult?.strips?.length ?? 0}${partsText}${utilText} · Width: ${usedWidth}`
      }
      return
    }

    if (strip) {
      state.activeStripIndex = actualIndex
      const totalSheets = state.nestResult?.strips?.length || state.nestResult?.strip_count || 0
      const waitingPrefix = strip.is_preview || state.nestResult?.is_preview ? 'Preview · ' : ''
      setNestStatsTone('')
      if (dom.nestStats) {
        dom.nestStats.textContent = `${waitingPrefix}Sheet ${actualIndex + 1} of ${totalSheets} · Waiting`
      }
      if (dom.svgContainer) dom.svgContainer.style.display = 'none'
      if (dom.svgContainer) dom.svgContainer.innerHTML = ''
      if (dom.emptyState) dom.emptyState.style.display = 'grid'
      syncViewportEmptyState(true)
      const placedTotal = (state.files || []).reduce((sum, f) => sum + (f.qty ?? 0), 0)
      const emptyMessage =
        placedTotal > 0 ? `Waiting for nesting result...` : `Import DXF files to start`
      if (dom.nestStats) {
        dom.nestStats.textContent = emptyMessage
      }
    }
    applyZoom(true)
  }

  function centerViewportOnContent(): void {
    if (!dom.viewport) return
    const maxScrollLeft = Math.max(0, dom.viewport.scrollWidth - dom.viewport.clientWidth)
    const maxScrollTop = Math.max(0, dom.viewport.scrollHeight - dom.viewport.clientHeight)
    dom.viewport.scrollLeft = maxScrollLeft / 2
    dom.viewport.scrollTop = maxScrollTop / 2
  }

  function applyZoom(recenter = false): void {
    const el = dom.svgContainer?.querySelector('svg') as SVGSVGElement | null
    if (el) {
      const viewBox = (el.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number)
      const baseWidth =
        Number(el.dataset.baseWidth) ||
        viewBox[2] ||
        el.viewBox?.baseVal?.width ||
        el.clientWidth ||
        1
      const baseHeight =
        Number(el.dataset.baseHeight) ||
        viewBox[3] ||
        el.viewBox?.baseVal?.height ||
        el.clientHeight ||
        1
      const fitWidth = Math.max(1, (dom.viewport?.clientWidth || baseWidth) - FIT_INSET_X * 2)
      const fitHeight = Math.max(1, (dom.viewport?.clientHeight || baseHeight) - FIT_INSET_Y * 2)
      const fitScale = Math.min(fitWidth / baseWidth, fitHeight / baseHeight, 1)
      el.dataset.baseWidth = String(baseWidth)
      el.dataset.baseHeight = String(baseHeight)
      el.style.width = `${baseWidth * fitScale * state.zoom}px`
      el.style.height = `${baseHeight * fitScale * state.zoom}px`
      el.style.transform = ''
    }
    if (dom.zoomLabel) dom.zoomLabel.textContent = Math.round(state.zoom * 100) + '%'
    if (recenter) {
      requestAnimationFrame(() => centerViewportOnContent())
    }
  }

  function bind(): void {
    dom.zoomIn?.addEventListener('click', () => {
      state.zoom = Math.min(4, state.zoom + 0.15)
      applyZoom()
    })
    dom.zoomOut?.addEventListener('click', () => {
      state.zoom = Math.max(0.2, state.zoom - 0.15)
      applyZoom()
    })
    dom.fitView?.addEventListener('click', () => {
      state.zoom = 1
      applyZoom(true)
    })

    let viewportDrag: any = null
    let rafId: number | null = null
    dom.viewport?.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0 || !dom.viewport) return
      viewportDrag = {
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: dom.viewport.scrollLeft,
        scrollTop: dom.viewport.scrollTop
      }
      dom.viewport.classList.add('dragging')
    })

    window.addEventListener('mousemove', (e) => {
      if (!viewportDrag || !dom.viewport) return
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (!viewportDrag || !dom.viewport) return
        dom.viewport.scrollLeft = viewportDrag.scrollLeft - (e.clientX - viewportDrag.startX)
        dom.viewport.scrollTop = viewportDrag.scrollTop - (e.clientY - viewportDrag.startY)
      })
    })

    window.addEventListener('mouseup', () => {
      if (!viewportDrag || !dom.viewport) return
      viewportDrag = null
      dom.viewport.classList.remove('dragging')
    })

    window.addEventListener('resize', () => {
      applyZoom(true)
    })
  }

  return {
    renderTabs,
    showNestResult,
    applyZoom,
    bind
  }
}
