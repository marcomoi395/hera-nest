export interface FileDialogResult {
  path: string
  name: string
  size: number
  bookmark?: string | null
}

export interface ParseResult {
  success: boolean
  data?: unknown
  raw?: unknown
  error?: string
}

export interface SaveResult {
  success: boolean
  path?: string
  error?: string
}

export interface AppMetaResult {
  success: boolean
  meta: {
    productName: string
    description: string
    version: string
    websiteUrl: string
    supportUrl: string
    releasesUrl: string
    redditUrl: string
    linkedInUrl: string
  }
}

export interface LoadSettingsResult {
  success: boolean
  settings?: unknown
  error?: string
}

export interface LoadJobStateResult {
  success: boolean
  state?: unknown
  error?: string
}

export interface NativeEngineInfo {
  success: boolean
  platform: string
  arch: string
  sparrowPath: string
  sparrowExists: boolean
  packaged: boolean
}

export interface SparrowPayload {
  strips: unknown[]
  spacing: number
  edgeSpacing: number
  [key: string]: unknown
}

export interface SparrowOptions {
  timeoutMs?: number
  collectArtifacts?: boolean
}

export interface SparrowResult {
  success: boolean
  runId: string
  inputPath?: string
  error?: string
}

export interface SparrowPollResult {
  success: boolean
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'stopped'
  result?: unknown
  summary?: unknown
  summaryPath?: string | null
  runDir?: string
  exitCode?: number | null
  artifacts?: unknown[]
  error?: string
  inputPath?: string
  stdout?: string
  stderr?: string
}

export interface ExportPayload {
  sheets: unknown[]
  settings: unknown
  outputDir: string
  outputDirBookmark?: string | null
  jobName?: string
  inputPath?: string | null
  exportItems?: unknown
  strips?: unknown[]
  [key: string]: unknown
}

export interface ExportResult {
  success: boolean
  fileCount?: number
  outputDir?: string
  files?: string[]
  error?: string
}

export interface ElectronAPI {
  openFileDialog: () => Promise<FileDialogResult[]>
  getPathForDroppedFile: (file: File) => string
  parseDXF: (filePath: string, bookmark?: string | null) => Promise<ParseResult>
  savePlacementJSON: (payload: unknown) => Promise<SaveResult>
  openExternalUrl: (url: string) => Promise<void>
  appMenuAction: (action: string) => Promise<void>
  getAppMeta: () => Promise<AppMetaResult>
  loadAppSettings: () => Promise<LoadSettingsResult>
  saveAppSettings: (settings: unknown) => Promise<SaveResult>
  loadJobState: () => Promise<LoadJobStateResult>
  saveJobState: (jobState: unknown) => Promise<SaveResult>
  writeDebugSVG: (payload: unknown) => Promise<SaveResult>
  writeDebugJSON: (payload: unknown) => Promise<SaveResult>
  getNativeEngineInfo: () => Promise<NativeEngineInfo>
  runSparrow: (payload: SparrowPayload, options?: SparrowOptions) => Promise<SparrowResult>
  pollSparrow: (runId: string) => Promise<SparrowPollResult>
  stopSparrow: (runId?: string) => Promise<{ success: boolean; stopped: boolean; error?: string }>
  chooseExportFolder: () => Promise<string | null>
  exportSheetsDXF: (payload: ExportPayload) => Promise<ExportResult>
  toPlanarGraph: (nodes: unknown[], edges: unknown[], gapTolerance?: number) => unknown
  discoverPlanarFaces: (nodes: unknown[], edges: unknown[]) => unknown
}
