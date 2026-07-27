import type { Polygon } from './geometry-types'

/**
 * DXF Entity Type Definitions
 * Proper types for DXF parsing and entity handling
 */

export interface Point {
  x: number
  y: number
  z?: number
}

export interface DxfEntity {
  // Common properties (always present or very common)
  type: string
  layer: string
  color?: number
  lineType?: string
  lineWeight?: number
  handle?: string

  // Properties from LineEntity
  start?: Point
  end?: Point

  // Properties from ArcEntity, CircleEntity
  center?: Point
  radius?: number
  startAngle?: number
  endAngle?: number
  angleLength?: number

  // Properties from EllipseEntity
  majorAxis?: Point
  majorAxisEndPoint?: Point
  axisRatio?: number
  startParameter?: number
  endParameter?: number

  // Properties from PolylineEntity
  vertices?: Point[]
  closed?: boolean
  shape?: boolean

  // Properties from SplineEntity
  controlPoints?: Point[]
  fitPoints?: Point[]
  degree?: number
  knots?: number[]

  // Properties from TextEntity
  text?: string
  position?: Point
  height?: number
  rotation?: number
}

export interface LineEntity extends DxfEntity {
  type: 'LINE'
  start: Point
  end: Point
}

export interface ArcEntity extends DxfEntity {
  type: 'ARC'
  center: Point
  radius: number
  startAngle: number
  endAngle: number
  angleLength?: number
}

export interface CircleEntity extends DxfEntity {
  type: 'CIRCLE'
  center: Point
  radius: number
}

export interface PolylineEntity extends DxfEntity {
  type: 'POLYLINE' | 'LWPOLYLINE'
  vertices: Point[]
  closed?: boolean
  shape?: boolean
}

export interface SplineEntity extends DxfEntity {
  type: 'SPLINE'
  controlPoints: Point[]
  degree?: number
  knots?: number[]
  closed?: boolean
}

export interface EllipseEntity extends DxfEntity {
  type: 'ELLIPSE'
  center: Point
  majorAxis: Point
  axisRatio: number
  startAngle?: number
  endAngle?: number
  startParameter?: number
  endParameter?: number
}

export interface TextEntity extends DxfEntity {
  type: 'TEXT' | 'MTEXT'
  text: string
  position: Point
  height?: number
  rotation?: number
}

export interface InsertEntity extends DxfEntity {
  type: 'INSERT'
  name: string
  position: Point
  xScale?: number
  yScale?: number
  rotation?: number
  attributes?: Record<string, unknown>
}

export type DxfEntityType =
  | LineEntity
  | ArcEntity
  | CircleEntity
  | PolylineEntity
  | SplineEntity
  | EllipseEntity
  | TextEntity
  | InsertEntity
  | DxfEntity

export interface DxfBlock {
  name: string
  entities: DxfEntityType[]
  position?: Point
}

export interface DxfTable {
  name: string
  entries: Record<string, unknown>[]
}

export interface DxfHeader {
  [key: string]: unknown
}

export interface DxfParsed {
  header?: DxfHeader
  tables?: Record<string, DxfTable>
  blocks?: Record<string, DxfBlock>
  entities?: DxfEntityType[]
}

// Type guards
export function isLineEntity(entity: DxfEntity): entity is LineEntity {
  return entity.type === 'LINE'
}

export function isArcEntity(entity: DxfEntity): entity is ArcEntity {
  return entity.type === 'ARC'
}

export function isCircleEntity(entity: DxfEntity): entity is CircleEntity {
  return entity.type === 'CIRCLE'
}

export function isPolylineEntity(entity: DxfEntity): entity is PolylineEntity {
  return entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE'
}

export function isSplineEntity(entity: DxfEntity): entity is SplineEntity {
  return entity.type === 'SPLINE'
}

export function isEllipseEntity(entity: DxfEntity): entity is EllipseEntity {
  return entity.type === 'ELLIPSE'
}

export function isTextEntity(entity: DxfEntity): entity is TextEntity {
  return entity.type === 'TEXT' || entity.type === 'MTEXT'
}

export function isInsertEntity(entity: DxfEntity): entity is InsertEntity {
  return entity.type === 'INSERT'
}

// Application-level DXF types
export interface DxfLayer {
  name: string
  color: string
}

export interface DxfHole {
  points: Point[]
}

export interface DxfShape {
  id: string
  type?: string
  polygon?: Polygon
  polygonPoints: Point[]
  holes?: DxfHole[]
  area?: number
  qty?: number
  rotation?: number
  allowedOrientations?: number[]
  exportEntities?: DxfEntityType[]
  layerIndex?: number
  visible?: boolean
}

export interface DxfFile {
  id: string
  path: string | null
  name: string
  size: number
  bookmark?: string | null
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
  path: string | null
  x: number
  y: number
  rotation: number
}

export interface Strip {
  index?: number
  json_path?: string
  svg_path?: string
  svg?: string
  strip_width?: number | null
  strip_height?: number | null
  density?: number | null
  item_count?: number
  placed_item_counts?: Array<{ item_id: number; count: number }>
  placed_item_ids?: number[]
  is_preview?: boolean
}

export interface NestResult {
  name?: string
  strips?: Strip[]
  strip_count?: number
  is_preview?: boolean
  sheets?: NestSheet[]
  utilization?: number
  totalArea?: number
  usedArea?: number
  runId?: string
}

export interface DxfPreviewShape {
  id?: string
  name?: string
  layer?: string
  visible?: boolean
  qty?: number
  type?: string
  bbox?: { x: number; y: number; w: number; h: number }
  polygonPoints?: Array<{ x: number; y: number }>
  holes?: Array<{ x: number; y: number }[]>
  involvedLayers?: string[]
  ownerLayers?: string[]
  decorSVG?: string[]
  decorItems?: Array<{ svg: string; [key: string]: unknown }>
  outerBoundaryItems?: Array<{ svg: string; [key: string]: unknown }>
  exportEntities?: Array<Record<string, unknown>>
  partLabel?: string
  layerColor?: string
  pathData?: string
  fillRule?: string
  hasSyntheticOuter?: boolean
  mixedOuterLayers?: boolean
  selectionFillAllowed?: boolean
  [key: string]: unknown
}

export interface DxfPreviewData {
  shapes: DxfPreviewShape[]
  layers: DxfLayer[]
  selectedId?: string
}
