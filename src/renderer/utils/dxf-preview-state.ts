import { partLabelFromName } from '../helpers'

export function clonePreviewShape(shape: Record<string, unknown>): Record<string, unknown> {
  return {
    ...shape,
    bbox: shape?.bbox ? { ...shape.bbox } : shape?.bbox,
    polygonPoints: Array.isArray(shape?.polygonPoints)
      ? shape.polygonPoints.map((point: Record<string, unknown>) => ({ ...point }))
      : shape?.polygonPoints,
    holes: Array.isArray(shape?.holes)
      ? shape.holes.map((hole: Record<string, unknown>) => ({ ...hole }))
      : shape?.holes,
    involvedLayers: Array.isArray(shape?.involvedLayers)
      ? [...shape.involvedLayers]
      : shape?.involvedLayers,
    ownerLayers: Array.isArray(shape?.ownerLayers) ? [...shape.ownerLayers] : shape?.ownerLayers,
    decorSVG: Array.isArray(shape?.decorSVG) ? [...shape.decorSVG] : shape?.decorSVG,
    decorItems: Array.isArray(shape?.decorItems)
      ? shape.decorItems.map((item: Record<string, unknown>) => ({ ...item }))
      : shape?.decorItems,
    outerBoundaryItems: Array.isArray(shape?.outerBoundaryItems)
      ? shape.outerBoundaryItems.map((item: Record<string, unknown>) => ({ ...item }))
      : shape?.outerBoundaryItems,
    exportEntities: Array.isArray(shape?.exportEntities)
      ? shape.exportEntities.map((entity: Record<string, unknown>) =>
          JSON.parse(JSON.stringify(entity))
        )
      : shape?.exportEntities,
    partLabel: shape?.partLabel
  }
}

export function clonePreviewData(
  data: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!data) return null
  return {
    shapes: Array.isArray(data.shapes) ? data.shapes.map(clonePreviewShape) : [],
    layers: Array.isArray(data.layers)
      ? data.layers.map((layer: Record<string, unknown>) => ({ ...layer }))
      : []
  }
}

export function applyPartLabelsToPreviewData(
  data: Record<string, unknown> | null,
  filename: string
): Record<string, unknown> | null {
  if (!(data?.shapes as any)?.length) return data
  const labelText = partLabelFromName(filename)
  ;(data!.shapes as Array<Record<string, unknown>>).forEach((shape: Record<string, unknown>) => {
    shape.partLabel = labelText
  })
  return data
}
