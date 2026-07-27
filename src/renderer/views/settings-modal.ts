import { SETTINGS_DEFAULTS, normalizeSettings } from '../../shared/settings'
import type { SettingsObject } from '../../types/settings'

export interface SettingsModalDeps {
  state: {
    settings: SettingsObject
  }
  dom: {
    settingsModal: HTMLDivElement | null
    settingsFields: HTMLInputElement[]
    openSettings?: HTMLButtonElement | null
    closeSettings?: HTMLButtonElement | null
    applySettings?: HTMLButtonElement | null
    resetSettings?: HTMLButtonElement | null
    [key: string]: unknown
  }
  onSettingsApplied: () => void
}

export interface SettingsModalApi {
  dialogDefaults: () => SettingsObject
  currentNestingSettings: () => SettingsObject
  loadPersistedSettings: () => Promise<void>
  persistCurrentSettings: () => Promise<void>
  applySettingsToDialog: (settings: SettingsObject) => void
  bind: () => void
}

interface SettingField extends HTMLInputElement {
  _syncCustomSelect?: () => void
}
export function createSettingsModal(deps: SettingsModalDeps): SettingsModalApi {
  const { state, dom, onSettingsApplied } = deps
  const settingsFields = Array.from(dom.settingsFields || []) as SettingField[]
  const devOnlyRows = Array.from(
    document.querySelectorAll('[data-dev-only-setting]')
  ) as HTMLElement[]
  let isDevBuild = false

  function settingFieldValue(field: SettingField): string | number | boolean {
    if (field.type === 'checkbox') return field.checked
    if (field.type === 'number') {
      if (field.value === '') return ''
      const numeric = Number(field.value)
      if (!Number.isFinite(numeric)) return ''
      const min = field.min === '' ? -Infinity : Number(field.min)
      const max = field.max === '' ? Infinity : Number(field.max)
      return Math.min(max, Math.max(min, numeric))
    }
    return field.value
  }

  function applySettingFieldValue(field: SettingField, value: unknown): void {
    if (value === undefined) return
    if (field.type === 'checkbox') {
      field.checked = !!value
      return
    }
    field.value = `${value}`
    if (typeof field._syncCustomSelect === 'function') field._syncCustomSelect()
  }

  function collectSettingsFromDialog(): Record<string, string | number | boolean> {
    return settingsFields.reduce(
      (acc: Record<string, string | number | boolean>, field: SettingField) => {
        acc[field.dataset.settingKey || ''] = settingFieldValue(field)
        return acc
      },
      {}
    )
  }

  function dialogDefaults(): SettingsObject {
    return { ...SETTINGS_DEFAULTS }
  }

  function applyDevOnlyVisibility(): void {
    devOnlyRows.forEach((row) => {
      row.hidden = !isDevBuild
    })
  }

  function normalizeDialogSettings(settings: Partial<SettingsObject>): SettingsObject {
    const normalized = normalizeSettings(settings)
    if (!isDevBuild) {
      normalized.sketchContourMethod = SETTINGS_DEFAULTS.sketchContourMethod
    }
    return normalized
  }

  function applySettingsToDialog(settings: SettingsObject): void {
    settingsFields.forEach((field: SettingField) =>
      applySettingFieldValue(field, settings[field.dataset.settingKey as keyof SettingsObject])
    )
  }

  function currentNestingSettings(): SettingsObject {
    return { ...dialogDefaults(), ...state.settings }
  }

  async function persistCurrentSettings(): Promise<void> {
    state.settings = normalizeDialogSettings(collectSettingsFromDialog())
    applySettingsToDialog(state.settings)
    if (!window.electronAPI?.saveAppSettings) return
    const result = await window.electronAPI.saveAppSettings(state.settings)
    if (!result?.success) {
      throw new Error(result?.error || 'Failed to save settings')
    }
  }

  async function loadPersistedSettings(): Promise<void> {
    const defaults = dialogDefaults()
    if (window.electronAPI?.getNativeEngineInfo) {
      try {
        const engineInfo = await window.electronAPI.getNativeEngineInfo()
        isDevBuild = !!(engineInfo?.success && !engineInfo?.packaged)
      } catch {
        isDevBuild = false
      }
    }
    applyDevOnlyVisibility()

    state.settings = normalizeDialogSettings(defaults)
    applySettingsToDialog(state.settings)

    if (!window.electronAPI?.loadAppSettings) return
    const result = await window.electronAPI.loadAppSettings()
    if (!result?.success) {
      console.warn('[Settings] Failed to load persisted settings:', result?.error)
      return
    }

    state.settings = normalizeDialogSettings(result.settings || {})
    applySettingsToDialog(state.settings)
  }

  function bind(): void {
    dom.openSettings?.addEventListener('click', () => dom.settingsModal?.classList.add('open'))
    dom.closeSettings?.addEventListener('click', () => dom.settingsModal?.classList.remove('open'))
    dom.applySettings?.addEventListener('click', async () => {
      try {
        await persistCurrentSettings()
        dom.settingsModal?.classList.remove('open')
        if (typeof onSettingsApplied === 'function') onSettingsApplied()
      } catch (err) {
        console.error('[Settings] Failed to persist settings:', err)
      }
    })
    dom.resetSettings?.addEventListener('click', async () => {
      state.settings = normalizeDialogSettings(dialogDefaults())
      applySettingsToDialog(state.settings)
      try {
        await persistCurrentSettings()
        if (typeof onSettingsApplied === 'function') onSettingsApplied()
      } catch (err) {
        console.error('[Settings] Failed to reset settings:', err)
      }
    })
  }

  return {
    dialogDefaults,
    currentNestingSettings,
    loadPersistedSettings,
    persistCurrentSettings,
    applySettingsToDialog,
    bind
  }
}
