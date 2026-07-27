import { getLineEndpoints } from '../utils/dxf-geometry'

export interface Point3D {
  x: number
  y: number
  z: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializePoint(point: any): Point3D | null {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
  return {
    x: +point.x,
    y: +point.y,
    z: Number.isFinite(point.z) ? +point.z : 0
  }
}

export function serializeEntityForExport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ent: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contourEntityToPoints: (ent: any) => unknown[]
): Record<string, unknown> | null {
  if (!ent || !ent.type) return null

  const isClosedPolyline = !!(ent.closed || ent.shape || ent.is3dPolygonMeshClosed)

  const out: Record<string, unknown> = {
    type: ent.type,
    layer: ent.layer || '0',
    closed: isClosedPolyline
  }

  if (ent.handle) out.handle = ent.handle
  if (Number.isFinite(ent.colorNumber)) out.colorNumber = ent.colorNumber
  if (Number.isFinite(ent.colorIndex)) out.colorIndex = ent.colorIndex
  if (Number.isFinite(ent.aci)) out.aci = ent.aci
  if (Number.isFinite(ent.trueColor)) out.trueColor = ent.trueColor
  if (typeof ent.color === 'string') out.color = ent.color

  if (ent.center) out.center = serializePoint(ent.center)
  if (ent.start) out.start = serializePoint(ent.start)
  if (ent.end) out.end = serializePoint(ent.end)
  if (Number.isFinite(ent.radius)) out.radius = +ent.radius
  if (Number.isFinite(ent.startAngle)) out.startAngle = +ent.startAngle
  if (Number.isFinite(ent.endAngle)) out.endAngle = +ent.endAngle
  if (Number.isFinite(ent.angleLength)) out.angleLength = +ent.angleLength
  if (Number.isFinite(ent.axisRatio)) out.axisRatio = +ent.axisRatio
  if (ent.majorAxisEndPoint) out.majorAxisEndPoint = serializePoint(ent.majorAxisEndPoint)
  if (Number.isFinite(ent.startParameter)) out.startParameter = +ent.startParameter
  if (Number.isFinite(ent.endParameter)) out.endParameter = +ent.endParameter

  if (ent.type === 'LINE' && (!out.start || !out.end)) {
    const endpoints = getLineEndpoints(ent)
    if (endpoints) {
      out.start = serializePoint(endpoints.start)
      out.end = serializePoint(endpoints.end)
    }
  }

  if (Array.isArray(ent.vertices)) {
    out.vertices = ent.vertices
      .map((vertex) => ({
        ...(serializePoint(vertex) || {}),
        ...(Number.isFinite(vertex?.startWidth) ? { startWidth: +vertex.startWidth } : {}),
        ...(Number.isFinite(vertex?.endWidth) ? { endWidth: +vertex.endWidth } : {}),
        ...(Number.isFinite(vertex?.bulge) ? { bulge: +vertex.bulge } : {}),
        ...(Number.isFinite(vertex?.faceA) ? { faceA: +vertex.faceA } : {}),
        ...(Number.isFinite(vertex?.faceB) ? { faceB: +vertex.faceB } : {}),
        ...(Number.isFinite(vertex?.faceC) ? { faceC: +vertex.faceC } : {}),
        ...(Number.isFinite(vertex?.faceD) ? { faceD: +vertex.faceD } : {}),
        ...(typeof vertex?.curveFittingVertex === 'boolean'
          ? { curveFittingVertex: vertex.curveFittingVertex }
          : {}),
        ...(typeof vertex?.curveFitTangent === 'boolean'
          ? { curveFitTangent: vertex.curveFitTangent }
          : {}),
        ...(typeof vertex?.splineVertex === 'boolean' ? { splineVertex: vertex.splineVertex } : {}),
        ...(typeof vertex?.splineControlPoint === 'boolean'
          ? { splineControlPoint: vertex.splineControlPoint }
          : {}),
        ...(typeof vertex?.threeDPolylineVertex === 'boolean'
          ? { threeDPolylineVertex: vertex.threeDPolylineVertex }
          : {}),
        ...(typeof vertex?.threeDPolylineMesh === 'boolean'
          ? { threeDPolylineMesh: vertex.threeDPolylineMesh }
          : {}),
        ...(typeof vertex?.polyfaceMeshVertex === 'boolean'
          ? { polyfaceMeshVertex: vertex.polyfaceMeshVertex }
          : {})
      }))
      .filter((vertex) => Number.isFinite(vertex.x) && Number.isFinite(vertex.y))
  }

  if (
    (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (!out.vertices || !(out.vertices as any).length)
  ) {
    const points = contourEntityToPoints(ent)
    if (Array.isArray(points) && points.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      out.vertices = points.map((point: any) => ({
        x: +point.x,
        y: +point.y,
        z: Number.isFinite(point.z) ? +point.z : 0
      }))
    }
  }

  if (Array.isArray(ent.fitPoints)) {
    out.fitPoints = ent.fitPoints.map(serializePoint).filter(Boolean)
  }
  if (Array.isArray(ent.controlPoints)) {
    out.controlPoints = ent.controlPoints.map(serializePoint).filter(Boolean)
  }
  if (Array.isArray(ent.knotValues)) {
    out.knotValues = ent.knotValues.filter(Number.isFinite).map(Number)
  } else if (Array.isArray(ent.knots)) {
    out.knotValues = ent.knots.filter(Number.isFinite).map(Number)
  }
  if (Number.isFinite(ent.degreeOfSplineCurve)) {
    out.degreeOfSplineCurve = ent.degreeOfSplineCurve
  }
  if (typeof ent.shape === 'boolean') out.shape = ent.shape
  if (typeof ent.hasContinuousLinetypePattern === 'boolean')
    out.hasContinuousLinetypePattern = ent.hasContinuousLinetypePattern
  if (Number.isFinite(ent.width)) out.width = +ent.width
  if (Number.isFinite(ent.elevation)) out.elevation = +ent.elevation
  if (Number.isFinite(ent.depth)) out.depth = +ent.depth
  if (Number.isFinite(ent.thickness)) out.thickness = +ent.thickness
  if (Number.isFinite(ent.extrusionDirectionX)) out.extrusionDirectionX = +ent.extrusionDirectionX
  if (Number.isFinite(ent.extrusionDirectionY)) out.extrusionDirectionY = +ent.extrusionDirectionY
  if (Number.isFinite(ent.extrusionDirectionZ)) out.extrusionDirectionZ = +ent.extrusionDirectionZ
  if (ent.extrusionDirection) out.extrusionDirection = serializePoint(ent.extrusionDirection)
  if (typeof ent.includesCurveFitVertices === 'boolean')
    out.includesCurveFitVertices = ent.includesCurveFitVertices
  if (typeof ent.includesSplineFitVertices === 'boolean')
    out.includesSplineFitVertices = ent.includesSplineFitVertices
  if (typeof ent.is3dPolyline === 'boolean') out.is3dPolyline = ent.is3dPolyline
  if (typeof ent.is3dPolygonMesh === 'boolean') out.is3dPolygonMesh = ent.is3dPolygonMesh
  if (typeof ent.is3dPolygonMeshClosed === 'boolean')
    out.is3dPolygonMeshClosed = ent.is3dPolygonMeshClosed
  if (typeof ent.isPolyfaceMesh === 'boolean') out.isPolyfaceMesh = ent.isPolyfaceMesh
  if (ent.startTangent) out.startTangent = serializePoint(ent.startTangent)
  if (ent.endTangent) out.endTangent = serializePoint(ent.endTangent)
  if (ent.normalVector) out.normalVector = serializePoint(ent.normalVector)
  if (typeof ent.periodic === 'boolean') out.periodic = ent.periodic
  if (typeof ent.rational === 'boolean') out.rational = ent.rational
  if (typeof ent.planar === 'boolean') out.planar = ent.planar
  if (typeof ent.linear === 'boolean') out.linear = ent.linear

  return out
}
