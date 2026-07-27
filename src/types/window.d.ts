import type { Point } from './geometry-types'
import type { ElectronAPI } from './electron-api'
import type { SettingsObject, MultiSheetStrategyConfig } from './settings'

export interface NestConstants {
  DEFAULT_ENGRAVING_COLOR: string
}

export interface NestSettings {
  SETTINGS_DEFAULTS: SettingsObject
  SKETCH_CONTOUR_METHODS: readonly string[]
  SHEET_WIDTH_PRIORITY_WEIGHTS: Record<string, number>
  MULTI_SHEET_STRATEGIES: readonly string[]
  MULTI_SHEET_STRATEGY_OPTIONS: Record<string, MultiSheetStrategyConfig>
  PREFERRED_ALIGNMENTS: readonly string[]
  ENGRAVING_STYLES: readonly string[]
  normalizeSettings(raw: unknown): SettingsObject
}

export interface NestEngravingLayout {
  DEFAULT_LAYOUT: {
    minCharHeight: number
    maxCharHeight: number
    charWidthRatio: number
    charAdvance: number
    minClearance: number
    clearanceScale: number
    gridDivisions: number
  }
  sanitizeLabelText(text: string): string
  layoutEngravingLabel(params: unknown): unknown
  engravingLabelText(text: string, style: string): string
  engravingVisualStyle(style: string): 'simple' | 'stroked'
}

export interface NestHelpers {
  uid(): string
  formatBytes(bytes: number): string
  formatWidthMeters(mm: number): string
  roundCoord(value: number | string): number
  partLabelFromName(name: string | null | undefined): string
  normalizeRotationStep(value: string | number): number | null
  buildAllowedOrientations(rotationStepValue: string | number): number[]
  sanitizePolygonPoints(points: unknown[]): Point[]
  clonePlain<T>(value: T): T
  effectiveFileQty(file: unknown): number
  buildJobName(files: { name?: string }[] | null | undefined, now?: Date): string
  sameExportPoint(a: Point | null | undefined, b: Point | null | undefined): boolean
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    NestConstants: NestConstants
    NestSettings: NestSettings
    NestEngravingLayout: NestEngravingLayout
    NestHelpers: NestHelpers
    Flatten: unknown
    jsts: unknown
    concaveman: (points: Point[], concavity?: number, lengthThreshold?: number) => Point[]
    NestDxfColor: unknown
    NestDxfGeometry: unknown
    NestDxfSvg: unknown
    NestDxfLayerService: unknown
    NestDxfExportMetadataService: unknown
    NestDxfEngravingPreviewService: unknown
    NestDxfShapeDetectionService: unknown
    NestDxfContourDetectionJstsService: unknown
    NestDxfContourDetectionService: unknown
    NestDxfShapeStructureService: unknown
    NestDxfRasterEnvelopeService: unknown
    NestDxfFlattenService: unknown
    NestDxfContourHelpers: unknown
    NestDxfPreviewState: unknown
    NestResultScoring: unknown
    NestTailRefinement: unknown
    parseDXFToShapes?: (data: unknown, raw: unknown, settings: SettingsObject) => unknown
  }
}

export {}
