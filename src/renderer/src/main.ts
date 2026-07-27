// Import CSS first
import '../assets/styles.css'

import Flatten from '@flatten-js/core'
import * as jstsModule from 'jsts/dist/jsts.min.js'
import concaveman from 'concaveman'

// Shared modules - import as ES modules and attach to window for legacy code
import * as NestConstants from '../../shared/constants'
import * as NestSettings from '../../shared/settings'
import * as NestEngravingLayout from '../../shared/engraving-layout'

// Utilities
import * as NestHelpers from '../helpers'
import * as NestDxfColor from '../utils/dxf-color'
import * as NestDxfGeometry from '../utils/dxf-geometry'
import * as NestDxfSvg from '../utils/dxf-svg'
import * as NestDxfPreviewState from '../utils/dxf-preview-state'
import * as NestResultScoring from '../utils/nest-result-scoring'
import * as NestTailRefinement from '../utils/tail-refinement'
import * as NestDxfContourHelpers from '../utils/contour-helpers'

// Services
import { createLayerResolver, FALLBACK_PALETTE } from '../services/dxf-layer-service'
import { serializePoint, serializeEntityForExport } from '../services/dxf-export-metadata-service'
import {
  LABEL_OUTLINE_FONT,
  LABEL_STROKE_FONT,
  buildPreviewLabelSvg
} from '../services/dxf-engraving-preview-service'
import { buildSketchGroups, extractPolygonForEntities } from '../services/dxf-flatten-service'
import { detectContour } from '../services/contour-detection-service'
import { createDxfShapeDetectionService } from '../services/dxf-shape-detection-service'
import { createDxfRasterEnvelopeService } from '../services/dxf-raster-envelope-service'
import { createDxfShapeStructureService } from '../services/dxf-shape-structure-service'
import { initializeRenderer } from '../renderer'

window.Flatten = Flatten
window.jsts = (jstsModule as { default?: unknown }).default || jstsModule
window.concaveman = concaveman

window.NestConstants = NestConstants
window.NestSettings = NestSettings
window.NestEngravingLayout = NestEngravingLayout
window.NestHelpers = NestHelpers
window.NestDxfColor = NestDxfColor
window.NestDxfGeometry = NestDxfGeometry
window.NestDxfSvg = NestDxfSvg
window.NestDxfPreviewState = NestDxfPreviewState
window.NestResultScoring = NestResultScoring
window.NestTailRefinement = NestTailRefinement
window.NestDxfContourHelpers = NestDxfContourHelpers
window.NestDxfLayerService = { createLayerResolver, FALLBACK_PALETTE }
window.NestDxfExportMetadataService = { serializePoint, serializeEntityForExport }
window.NestDxfEngravingPreviewService = {
  LABEL_OUTLINE_FONT,
  LABEL_STROKE_FONT,
  buildPreviewLabelSvg
}
window.NestDxfFlattenService = { buildSketchGroups, extractPolygonForEntities }
window.NestDxfContourDetectionService = { detectContour }

console.log('[MAIN.TS] Script loaded, readyState:', document.readyState)
window.NestDxfShapeDetectionService = createDxfShapeDetectionService({
  geometry: window.NestDxfGeometry as any,
  svg: window.NestDxfSvg as any,
  concaveman: window.concaveman
})
window.NestDxfRasterEnvelopeService = createDxfRasterEnvelopeService({
  geometry: window.NestDxfGeometry as any,
  shapeDetectionService: window.NestDxfShapeDetectionService as any
})
window.NestDxfShapeStructureService = createDxfShapeStructureService({
  geometry: window.NestDxfGeometry as any,
  flattenService: window.NestDxfFlattenService as any,
  shapeDetectionService: window.NestDxfShapeDetectionService as any,
  rasterEnvelopeService: window.NestDxfRasterEnvelopeService as any
})

console.log('[MAIN.TS] Checking for DOM elements...')
console.log('[MAIN.TS] dropZone:', document.getElementById('dropZone'))
console.log('[MAIN.TS] addSheetBtn:', document.getElementById('addSheetBtn'))
console.log('[MAIN.TS] openSettings:', document.getElementById('openSettings'))

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeRenderer)
} else {
  initializeRenderer()
}
