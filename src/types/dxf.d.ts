import type { Point, Polygon } from './geometry'

export interface DxfLayer {
  name: string
  color: string
}

export interface DxfShape {
  id: string
  type: string
  polygon: Polygon
  area: number
  qty: number
  rotation?: number
  allowedOrientations?: number[]
  exportEntities?: unknown[]
  layerIndex?: number
}

export interface DxfFile {
  id: string
  path: string
  name: string
  size: number
  bookmark?: string
  shapes?: DxfShape[]
  layers?: DxfLayer[]
  qty?: number
  _multiSketchDetection?: boolean
  _sketchContourMethod?: string
}

export interface NestSheet {
  id: string
  width: number
  height?: number
  material?: string
  widthMode?: string
  placements?: NestPlacement[]
}

export interface NestPlacement {
  fileId: string
  shapeId: string
  x: number
  y: number
  rotation: number
}

export interface NestResult {
  sheets: NestSheet[]
  utilization: number
  runId?: string
}
