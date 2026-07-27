/* eslint-disable @typescript-eslint/no-explicit-any */

// JSTS library (loaded globally via script tag)
declare namespace jsts {
  namespace geom {
    class Coordinate {
      constructor(x: number, y: number)
      x: number
      y: number
    }
    class PrecisionModel {
      constructor(scale: number)
    }
    class GeometryFactory {
      constructor(precisionModel: PrecisionModel)
      createLineString(coordinates: Coordinate[]): any
      createGeometryCollection(geometries: any[]): any
      getPrecisionModel(): PrecisionModel
    }
  }
  namespace operation {
    namespace union {
      class UnaryUnionOp {
        static union(geometry: any): any
      }
    }
    namespace overlay {
      namespace snap {
        class GeometrySnapper {
          static computeSizeBasedSnapTolerance(geometry: any): number
          static snapToSelf(geometry: any, tolerance: number, cleanResult: boolean): any
        }
      }
    }
    namespace polygonize {
      class Polygonizer {
        add(geometry: any): void
        getPolygons(): any
      }
    }
  }
  namespace precision {
    class GeometryPrecisionReducer {
      static reduce(geometry: any, precisionModel: PrecisionModel): any
    }
  }
}

// Type aliases for JSTS geometry objects
type JstsFactory = jsts.geom.GeometryFactory
type JstsGeometry = any

// DXF Entity and Vertex types (from dxf-parser or similar)
interface DXFVertex {
  x: number
  y: number
  z?: number
  bulge?: number
}

type DxfEntity = any
type DXFEntity = any
declare module 'jsts'
declare module 'jsts/dist/jsts.min.js'
declare module 'concaveman'

// Flatten.js library (loaded globally via script tag)
declare const Flatten: any
