// Core geometric primitives
export interface Point {
  x: number
  y: number
}

export interface Polygon {
  points: Point[]
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Geometry Type Definitions
 * Application-specific geometry types (JSTS is loaded globally)
 */

// Application-specific geometry types
export interface BoundingBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface GeometryBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ContourPoint {
  x: number
  y: number
}

export interface ContourPolygon {
  points: ContourPoint[]
  holes?: ContourPoint[][]
}
