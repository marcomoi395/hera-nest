import { emptyContourResult, ContourResult } from '../utils/contour-helpers'
import { buildArrangementContour } from './contour-detection-jsts-service'
import { debugDXF } from './dxf-shape-detection-service'

export function detectContour(input: any, options: any = {}): ContourResult {
  if (Array.isArray(input)) return emptyContourResult('array-input-unsupported')
  const shapeRecord = input
  if (!shapeRecord?.entities?.length) return emptyContourResult('missing-shape-record')

  const rawMethod = options?.contourMethod
  const method = rawMethod == null ? 'auto' : String(rawMethod)

  const routingDebug = {
    shapeId: shapeRecord?.id || null,
    rawMethodType: typeof rawMethod,
    rawMethod,
    resolvedMethod: method,
    jstsAvailable: typeof buildArrangementContour === 'function',
    selected: 'arrangement'
  }

  // Assuming debugDXF exists and works
  try {
    debugDXF('Contour routing', routingDebug)
  } catch (e) {
    // Ignore if not initialized yet
  }

  return typeof buildArrangementContour === 'function'
    ? buildArrangementContour(shapeRecord, options)
    : emptyContourResult('missing-arrangement-detector', routingDebug)
}
