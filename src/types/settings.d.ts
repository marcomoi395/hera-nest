export interface SettingsObject {
  partSpacing: number
  sheetMargin: number
  rotationStep: string
  mirrorParts: boolean
  earlyStopping: boolean
  preferredAlignment: string
  timeLimit: number
  rngSeed: number
  multiSeedQualityRuns: number
  tailRuns: number
  workers: number
  exportFormat: string
  exportDebug: boolean
  joinConnectedLinework: boolean
  useBlocks: boolean
  engravingLayer: string
  engravingStyle: string
  sketchContourMethod: string
  multiSketchDetection: boolean
  multiSheetStrategy: string
  engravingLayout?: LayoutConfig
}

export interface MultiSheetStrategyConfig {
  multiStripMode: string
  bucketFillWeight: number | null
}

export interface LayoutConfig {
  anchorH: string
  anchorV: string
  offsetX: number
  offsetY: number
}

export interface NestPlacementExportItem {
  fileId: string
  shapeId: string
  x: number
  y: number
  rotation: number
  stripIndex?: number
  [key: string]: unknown
}
