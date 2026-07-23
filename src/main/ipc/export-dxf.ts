import { ipcMain } from 'electron'
import path from 'path'
import { promises as fs } from 'fs'
import { DxfWriter } from '@tarikjabiri/dxf'
import { normalizeSettings } from '../../shared/settings'
import {
  layoutEngravingLabel,
  engravingLabelText,
  engravingVisualStyle
} from '../../shared/engraving-layout'
import { withSecurityScopedAccess } from '../utils/security-scoped-bookmarks'
import type { ExportPayload, ExportResult } from '../../types/electron-api'
import type { Point } from '../../types/geometry'

export function registerExportDxfIpc(): void {
  ipcMain.handle('export-sheets-dxf', async (_event, payload: ExportPayload): Promise<ExportResult> => {
    try {
      const sheets = payload.sheets || []
      const settings = normalizeSettings(payload.settings || {})
      const outputDir = payload.outputDir || payload.outputPath

      if (!outputDir) return { success: false, error: 'No output path provided' }
      if (!sheets.length) return { success: false, error: 'No sheets to export' }

      const files: string[] = []

      await withSecurityScopedAccess(payload.outputDirBookmark || null, async () => {
        for (let i = 0; i < sheets.length; i++) {
          const sheet = sheets[i] as any
          if (!sheet?.placements?.length) continue

          const writer = new DxfWriter()
          writer.addLayer('0', 7, 'CONTINUOUS')
          writer.addLayer('PARTS', 3, 'CONTINUOUS')
          writer.addLayer('SHEET', 1, 'CONTINUOUS')
          if (settings.engravingLayer !== 'off') writer.addLayer(settings.engravingLayer, 5, 'CONTINUOUS')

          writer.addLWPolyline(
            [
              { point: { x: 0, y: 0 } },
              { point: { x: sheet.width, y: 0 } },
              { point: { x: sheet.width, y: sheet.height } },
              { point: { x: 0, y: sheet.height } },
              { point: { x: 0, y: 0 } }
            ],
            { layerName: 'SHEET' }
          )

          for (const placement of sheet.placements) {
            const item = placement.item
            if (!item?.shape) continue

            const rotation = placement.rotation || 0
            const tx = placement.x || 0
            const ty = placement.y || 0
            const outerPolygon = transformPolygon(item.shape.polygon, rotation, tx, ty)
            drawPolygon(writer, outerPolygon, 'PARTS')

            if (Array.isArray(item.shape.holes)) {
              for (const hole of item.shape.holes) {
                drawPolygon(writer, transformPolygon(hole, rotation, tx, ty), 'PARTS')
              }
            }

            if (settings.engravingLayer !== 'off' && item.label) {
              const engravingText = engravingLabelText(item.label, settings.engravingStyle)
              if (engravingText) {
                const layoutResult = layoutEngravingLabel({
                  text: engravingText,
                  outerPolygon,
                  holes: Array.isArray(item.shape.holes)
                    ? item.shape.holes.map((hole: any) => transformPolygon(hole, rotation, tx, ty))
                    : [],
                  ...settings.engravingLayout
                } as any)

                if (layoutResult) {
                  const visualStyle = engravingVisualStyle(settings.engravingStyle)
                  void visualStyle
                  writer.addText(
                    { x: layoutResult.center.x, y: layoutResult.center.y, z: 0 },
                    layoutResult.charH,
                    layoutResult.text,
                    { layerName: settings.engravingLayer }
                  )
                }
              }
            }
          }

          const fullPath = path.join(outputDir, `sheet_${i + 1}.dxf`)
          await fs.writeFile(fullPath, writer.stringify(), 'utf-8')
          files.push(fullPath)
        }
      })

      return { success: true, fileCount: files.length, outputDir, files }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}

function transformPoint(point: Point, rotation: number, tx: number, ty: number): Point {
  const radians = rotation * (Math.PI / 180)
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: point.x * cos - point.y * sin + tx,
    y: point.x * sin + point.y * cos + ty
  }
}

function transformPolygon(polygon: Point[], rotation: number, tx: number, ty: number): Point[] {
  return Array.isArray(polygon) ? polygon.map((point) => transformPoint(point, rotation, tx, ty)) : []
}

function drawPolygon(writer: DxfWriter, polygon: Point[], layer: string): void {
  if (!Array.isArray(polygon) || polygon.length < 2) return
  const vertices = polygon.map((point) => ({ point: { x: point.x, y: point.y } }))
  const first = polygon[0]
  const last = polygon[polygon.length - 1]
  if (Math.abs(first.x - last.x) > 1e-6 || Math.abs(first.y - last.y) > 1e-6) {
    vertices.push({ point: { x: first.x, y: first.y } })
  }
  writer.addLWPolyline(vertices, { layerName: layer })
}
