import { partLabelFromName } from '../helpers'

export function clonePreviewShape(shape: any): any {
  return {
    ...shape,
    bbox: shape?.bbox ? { ...shape.bbox } : shape?.bbox,
    polygonPoints: Array.isArray(shape?.polygonPoints)
      ? shape.polygonPoints.map((point: any) => ({ ...point }))
      : shape?.polygonPoints,
    holes: Array.isArray(shape?.holes)
      ? shape.holes.map((hole: any) => ({ ...hole }))
      : shape?.holes,
    involvedLayers: Array.isArray(shape?.involvedLayers)
      ? [...shape.involvedLayers]
      : shape?.involvedLayers,
    ownerLayers: Array.isArray(shape?.ownerLayers) ? [...shape.ownerLayers] : shape?.ownerLayers,
    decorSVG: Array.isArray(shape?.decorSVG) ? [...shape.decorSVG] : shape?.decorSVG,
    decorItems: Array.isArray(shape?.decorItems)
      ? shape.decorItems.map((item: any) => ({ ...item }))
      : shape?.decorItems,
    outerBoundaryItems: Array.isArray(shape?.outerBoundaryItems)
      ? shape.outerBoundaryItems.map((item: any) => ({ ...item }))
      : shape?.outerBoundaryItems,
    exportEntities: Array.isArray(shape?.exportEntities)
      ? shape.exportEntities.map((entity: any) => JSON.parse(JSON.stringify(entity)))
      : shape?.exportEntities,
    partLabel: shape?.partLabel
  }
}

export function clonePreviewData(data: any): any {
  if (!data) return null
  return {
    shapes: Array.isArray(data.shapes) ? data.shapes.map(clonePreviewShape) : [],
    layers: Array.isArray(data.layers) ? data.layers.map((layer: any) => ({ ...layer })) : []
  }
}

export function applyPartLabelsToPreviewData(data: any, filename: string): any {
  if (!data?.shapes?.length) return data
  const labelText = partLabelFromName(filename)
  data.shapes.forEach((shape: any) => {
    shape.partLabel = labelText
  })
  return data
}
