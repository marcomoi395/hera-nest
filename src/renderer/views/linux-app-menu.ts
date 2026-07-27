interface HelpUrls {
  supportUrl: string
  releasesUrl: string
  websiteUrl: string
  redditUrl?: string
  linkedInUrl?: string
}

interface MenuItemSeparator {
  type: 'separator'
}

interface MenuItemIpc {
  label: string
  action: string
  type: 'ipc'
}

interface MenuItemUrl {
  label: string
  action: string
  type: 'url'
}

interface MenuItemLocal {
  label: string
  action: string
  type: 'local'
}

type MenuItem = MenuItemSeparator | MenuItemIpc | MenuItemUrl | MenuItemLocal

interface AppMeta extends HelpUrls {
  productName: string
  description: string
  version: string
}

interface AboutDialog {
  overlay: HTMLDivElement
  dialog: HTMLDivElement
  open: () => void
  close: () => void
}

interface OpenMenuState {
  menu: HTMLDivElement
  button: HTMLElement
  cleanup: () => void
}

export function createLinuxAppMenu(): {
  bind: () => void
  closeOpenMenu: () => void
} {
  const isLinux = document.body.classList.contains('platform-linux')
  const HELP_URLS: any = {
    supportUrl: 'https://github.com/marcomoi395/hera-nest/issues',
    releasesUrl: 'https://github.com/marcomoi395/hera-nest/releases',
    // redditUrl: 'https://www.reddit.com/r/kenzap/',
    // linkedInUrl: 'https://www.linkedin.com/company/kenzap',
    websiteUrl: 'https://github.com/marcomoi395/hera-nest',
  }

  const MENUS: Record<string, MenuItem[]> = {
    app: [
      { label: 'About Hera Nest', action: 'about', type: 'local' },
      { type: 'separator' },
      { label: 'Exit Hera Nest', action: 'quit', type: 'ipc' },
    ],
    window: [
      { label: 'Minimize', action: 'minimize-window', type: 'ipc' },
      { label: 'Zoom', action: 'toggle-maximize-window', type: 'ipc' },
      { label: 'Close', action: 'close-window', type: 'ipc' }
    ],
    help: [
      { label: 'Support', action: 'supportUrl', type: 'url' },
      { label: 'Release Notes', action: 'releasesUrl', type: 'url' },
      { label: 'Reddit Community', action: 'redditUrl', type: 'url' },
      { label: 'LinkedIn', action: 'linkedInUrl', type: 'url' },
      { label: 'Hera Nest Website', action: 'websiteUrl', type: 'url' },
    ],
  }

  let openMenuState: any = null
  let appMeta: any = {
    productName: 'Hera Nest',
    description: 'DXF nesting desktop application with live preview and production DXF export.',
    version: '',
    ...HELP_URLS
  }
  let aboutDialog: AboutDialog | null = null

  function ensureAboutDialog(): AboutDialog {
    if (aboutDialog) return aboutDialog

    const overlay = document.createElement('div')
    overlay.className = 'linux-about-overlay'
    overlay.hidden = true

    const dialog = document.createElement('div')
    dialog.className = 'linux-about-dialog'

    dialog.innerHTML = `
      <button type="button" class="linux-about-close" aria-label="Close about dialog">×</button>
      <div class="linux-about-logo" aria-hidden="true">
        <svg width="46" height="46" viewBox="0 0 22 22" fill="none">
          <rect x="1" y="1" width="9" height="6" rx="1.5" fill="#4f8ef7"/>
          <rect x="12" y="1" width="9" height="9" rx="1.5" fill="#4f8ef7" opacity="0.7"/>
          <rect x="1" y="9" width="5" height="12" rx="1.5" fill="#4f8ef7" opacity="0.5"/>
          <rect x="8" y="12" width="13" height="9" rx="1.5" fill="#4f8ef7" opacity="0.85"/>
        </svg>
      </div>
      <div class="linux-about-name"></div>
      <div class="linux-about-version"></div>
      <div class="linux-about-description"></div>
      <div class="linux-about-copy">Copyright © 2026 Thanh Loi</div>
      <div class="linux-about-actions">
        <button type="button" class="linux-about-btn" data-about-link="websiteUrl">Website</button>
        <button type="button" class="linux-about-btn" data-about-link="supportUrl">Support</button>
      </div>
    `

    overlay.appendChild(dialog)
    document.body.appendChild(overlay)

    function close(): void {
      overlay.hidden = true
    }

    function open(): void {
      updateAboutDialog()
      overlay.hidden = false
    }

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close()
    })

    dialog.querySelector('.linux-about-close')?.addEventListener('click', close)
    dialog.querySelectorAll('[data-about-link]').forEach((button) => {
      const buttonEl = button as HTMLButtonElement
      buttonEl.addEventListener('click', () => {
        const linkKey = buttonEl.dataset.aboutLink as keyof HelpUrls
        const url = appMeta[linkKey] || HELP_URLS[linkKey]
        if (url) window.electronAPI?.openExternalUrl?.(url)
      })
    })

    document.addEventListener('keydown', (event) => {
      if (!overlay.hidden && event.key === 'Escape') close()
    })

    aboutDialog = { overlay, dialog, open, close }
    return aboutDialog
  }

  function updateAboutDialog(): void {
    const dialog = ensureAboutDialog().dialog
    if (dialog.querySelector('.linux-about-name')) dialog.querySelector('.linux-about-name').textContent = appMeta.productName || 'Hera Nest'
    if (dialog.querySelector('.linux-about-version')) dialog.querySelector('.linux-about-version').textContent = appMeta.version ? `Version ${appMeta.version}` : ''
    if (dialog.querySelector('.linux-about-description')) dialog.querySelector('.linux-about-description').textContent =
      appMeta.description || 'DXF nesting desktop application with live preview and production DXF export.'
  }

  async function preloadAppMeta(): Promise<void> {
    try {
      const result = await window.electronAPI?.getAppMeta?.()
      if (result?.success && result.meta) {
        appMeta = { ...appMeta, ...result.meta }
        updateAboutDialog()
      }
    } catch {
      // Fall back to local defaults.
    }
  }

  async function invokeMenuItem(item: MenuItem): Promise<void> {
    if (item.type === 'separator') return

    if (item.type === 'ipc') {
      await window.electronAPI?.appMenuAction?.(item.action)
      return
    }
    if (item.type === 'url') {
      const targetUrl =
        appMeta[item.action as keyof HelpUrls] || HELP_URLS[item.action as keyof HelpUrls]
      if (targetUrl) await window.electronAPI?.openExternalUrl?.(targetUrl)
      return
    }
    if (item.type === 'local' && item.action === 'about') {
      ensureAboutDialog().open()
    }
  }

  function closeOpenMenu(): void {
    if (!openMenuState) return
    const { menu, button, cleanup } = openMenuState
    cleanup()
    menu.remove()
    button.classList.remove('open')
    button.setAttribute('aria-expanded', 'false')
    openMenuState = null
  }

  function positionMenu(button: HTMLElement, menu: HTMLElement): void {
    const rect = button.getBoundingClientRect()
    const gap = 4
    const menuRect = menu.getBoundingClientRect()
    const maxLeft = Math.max(gap, window.innerWidth - menuRect.width - gap)
    menu.style.left = `${Math.max(gap, Math.min(rect.left, maxLeft))}px`
    menu.style.top = `${rect.bottom + gap}px`
  }

  function openMenu(button: HTMLElement, menuName: string): void {
    const items = MENUS[menuName]
    if (!items?.length) return

    if (openMenuState?.button === button) {
      closeOpenMenu()
      return
    }
    closeOpenMenu()

    const menu = document.createElement('div')
    menu.className = 'linux-menu-popup'
    menu.setAttribute('role', 'menu')

    items.forEach((item) => {
      if (item.type === 'separator') {
        const separator = document.createElement('div')
        separator.className = 'linux-menu-separator'
        menu.appendChild(separator)
        return
      }

      const entry = document.createElement('button')
      entry.type = 'button'
      entry.className = 'linux-menu-item'
      entry.textContent = item.label
      entry.setAttribute('role', 'menuitem')
      entry.addEventListener('click', async () => {
        closeOpenMenu()
        await invokeMenuItem(item)
      })
      menu.appendChild(entry)
    })

    document.body.appendChild(menu)
    positionMenu(button, menu)
    button.classList.add('open')
    button.setAttribute('aria-expanded', 'true')

    function onOutsidePointer(event: Event): void {
      if (button.contains(event.target as Node) || menu.contains(event.target as Node)) return
      closeOpenMenu()
    }

    function onKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeOpenMenu()
        button.focus()
      }
    }

    function cleanup(): void {
      document.removeEventListener('pointerdown', onOutsidePointer, true)
      document.removeEventListener('keydown', onKeydown, true)
      window.removeEventListener('resize', closeOpenMenu, true)
      window.removeEventListener('scroll', closeOpenMenu, { capture: true })
    }

    document.addEventListener('pointerdown', onOutsidePointer, true)
    document.addEventListener('keydown', onKeydown, true)
    window.addEventListener('resize', closeOpenMenu, true)
    window.addEventListener('scroll', closeOpenMenu, { capture: true, passive: true })

    openMenuState = { menu, button, cleanup }
  }

  function bind(): void {
    if (!isLinux) return
    const menuBar = document.getElementById('linuxMenuBar')
    if (!menuBar) return
    menuBar.hidden = false
    preloadAppMeta()
    ensureAboutDialog()
    menuBar.querySelectorAll('[data-linux-menu]').forEach((button) => {
      const buttonEl = button as HTMLElement
      buttonEl.setAttribute('aria-haspopup', 'menu')
      buttonEl.setAttribute('aria-expanded', 'false')
      buttonEl.addEventListener('click', () => {
        const menuName = buttonEl.dataset.linuxMenu
        if (menuName) openMenu(buttonEl, menuName)
      })
    })
  }

  return {
    bind,
    closeOpenMenu
  }
}
