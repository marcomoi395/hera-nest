import { contextBridge, ipcRenderer, webUtils } from 'electron'

const PRODUCT_NAME = 'Kenzap Nesting'
const APP_DESCRIPTION =
  'DXF nesting desktop application with live preview and production DXF export.'
const WEBSITE_URL = 'https://kenzap.com/nesting/'
const SUPPORT_URL = 'https://kenzap.com/nesting-support/'
const RELEASES_URL = 'https://github.com/kenzap/nesting-app/releases'
const REDDIT_URL = 'https://www.reddit.com/r/kenzap/'
const LINKEDIN_URL = 'https://www.linkedin.com/company/kenzap'

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  getPathForDroppedFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  parseDXF: (filePath: string, bookmark: string | null = null) =>
    ipcRenderer.invoke('parse-dxf', { filePath, bookmark }),
  savePlacementJSON: (payload: any) => ipcRenderer.invoke('save-placement-json', payload),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
  appMenuAction: (action: string) => ipcRenderer.invoke('app-menu-action', action),
  getAppMeta: async () => {
    try {
      const result = await ipcRenderer.invoke('get-app-meta')
      if (result?.success && result.meta) return result
    } catch {
      // Fall through to local defaults
    }
    return {
      success: true,
      meta: {
        productName: PRODUCT_NAME,
        description: APP_DESCRIPTION,
        version: '',
        websiteUrl: WEBSITE_URL,
        supportUrl: SUPPORT_URL,
        releasesUrl: RELEASES_URL,
        redditUrl: REDDIT_URL,
        linkedInUrl: LINKEDIN_URL
      }
    }
  },
  loadAppSettings: () => ipcRenderer.invoke('load-app-settings'),
  saveAppSettings: (settings: any) => ipcRenderer.invoke('save-app-settings', settings),
  loadJobState: () => ipcRenderer.invoke('load-job-state'),
  saveJobState: (jobState: any) => ipcRenderer.invoke('save-job-state', jobState),
  writeDebugSVG: (payload: any) => ipcRenderer.invoke('write-debug-svg', payload),
  writeDebugJSON: (payload: any) => ipcRenderer.invoke('write-debug-json', payload),
  getNativeEngineInfo: () => ipcRenderer.invoke('get-native-engine-info'),
  runSparrow: (payload: any, options?: any) => ipcRenderer.invoke('run-sparrow', payload, options),
  pollSparrow: (runId: string) => ipcRenderer.invoke('poll-sparrow', runId),
  stopSparrow: () => ipcRenderer.invoke('stop-sparrow'),
  chooseExportFolder: () => ipcRenderer.invoke('choose-export-folder'),
  exportSheetsDXF: (payload: any) => ipcRenderer.invoke('export-sheets-dxf', payload),
  toPlanarGraph: (nodes: any[], edges: any[], gapTolerance?: number) => {
    const response = ipcRenderer.sendSync('to-planar-graph-sync', {
      nodes,
      edges,
      gapTolerance
    })
    if (response?.success) return response.data
    throw new Error(response?.error || 'to-planar-graph failed')
  },
  discoverPlanarFaces: (nodes: any[], edges: any[]) => {
    const response = ipcRenderer.sendSync('discover-planar-faces-sync', {
      nodes,
      edges
    })
    if (response?.success) return response.data
    throw new Error(response?.error || 'planar-face-discovery failed')
  }
})
