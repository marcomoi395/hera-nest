import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { app, ipcMain } from 'electron'
import path from 'path'
import { promises as fs } from 'fs'
import { spawn, ChildProcess } from 'child_process'
import { compactLastStripArtifacts } from '../utils/compact-last-strip'
import type {
  NativeEngineInfo,
  SparrowPayload,
  SparrowOptions,
  SparrowResult,
  SparrowPollResult
} from '../../types/electron-api'

interface SparrowRun {
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'stopped'
  result?: any
  summary?: any
  summaryPath?: string | null
  artifacts?: any[]
  error?: string
  runDir: string
  safeName: string
  inputPath?: string
  stdout?: string
  stderr?: string
  exitCode?: number | null
}

const activeSparrowProcesses = new Map<string, ChildProcess>()
const sparrowRuns = new Map<string, SparrowRun>()

function isDevMode(): boolean {
  return !app.isPackaged || process.argv.includes('--dev')
}

function nativePlatformDir(): string {
  const platform = process.platform
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'macos'
  return platform
}

function nativeExecutableName(baseName: string): string {
  return process.platform === 'win32' ? `${baseName}.exe` : baseName
}

function nativeBaseDir(): string {
  const platformDir = nativePlatformDir()
  const packagedBase = path.join(process.resourcesPath, 'native', platformDir, 'bin')
  if (isDevMode()) {
    const devBase = path.join(process.cwd(), 'native', platformDir, 'bin')
    if (existsSync(path.join(devBase, nativeExecutableName('sparrow')))) return devBase
  }
  if (process.platform === 'darwin') {
    const helperBase = path.join(process.resourcesPath, '..', 'Helpers')
    if (existsSync(path.join(helperBase, nativeExecutableName('sparrow')))) return helperBase
  }
  return packagedBase
}

function resolveNativeExecutable(baseName: string): string {
  return path.join(nativeBaseDir(), nativeExecutableName(baseName))
}

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`
}

function resolveSparrowCargoManifestPath(): string {
  return process.env.SPARROW_CARGO_MANIFEST_PATH || process.env.NESTING_CARGO_MANIFEST_PATH || path.resolve(process.cwd(), '../nesting/Cargo.toml')
}

function buildCargoRunCommand(args: string[]): string {
  return `cargo run --manifest-path ${shellQuote(resolveSparrowCargoManifestPath())} -- ${args.map(shellQuote).join(' ')}`
}

function buildSpawnCommand(executablePath: string, args: string[]): [string, string[]] {
  return [executablePath, args]
}

function readJsonIfExists(filePath: string): any {
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

function readPlacedItemCounts(jsonPath: string): Array<{ item_id: number; count: number }> {
  let stripData: any = null
  try {
    stripData = readJsonIfExists(jsonPath)
  } catch {
    return []
  }
  const placedItems = stripData?.solution?.layout?.placed_items ? stripData.solution.layout.placed_items : []
  const counts = new Map<number, number>()
  placedItems.forEach((placement: any) => {
    const itemId = Number(placement?.item_id)
    if (!Number.isFinite(itemId)) return
    counts.set(itemId, (counts.get(itemId) || 0) + 1)
  })
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([item_id, count]) => ({ item_id, count }))
}

function rewriteTailIdMapping(runDir: string, safeName: string, inputPath: string): void {
  const inputJson = readJsonIfExists(inputPath)
  const mapping = inputJson?._tailIdMapping
  if (!mapping || typeof mapping !== 'object') return

  const outputDir = path.join(runDir, 'output')
  const rewrite = (jsonPath: string) => {
    const data = readJsonIfExists(jsonPath)
    if (!data) return
    let changed = false
    if (Array.isArray(data.items)) {
      data.items.forEach((item: any) => {
        const original = mapping[String(item.id)]
        if (original !== undefined) {
          item.id = original
          changed = true
        }
      })
    }
    const placed = data.solution?.layout?.placed_items
    if (Array.isArray(placed)) {
      placed.forEach((p: any) => {
        const original = mapping[String(p.item_id)]
        if (original !== undefined) {
          p.item_id = original
          changed = true
        }
      })
    }
    if (changed) writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8')
  }

  const continuousJson = path.join(outputDir, `final_${safeName}.json`)
  if (existsSync(continuousJson)) rewrite(continuousJson)

  const finalDir = [
    path.join(outputDir, `final_${safeName}`),
    ...(!existsSync(path.join(outputDir, `final_${safeName}`))
      ? (existsSync(outputDir)
        ? readdirSync(outputDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && e.name.startsWith('final_'))
            .map((e) => path.join(outputDir, e.name))
        : [])
      : [])
  ].find((d) => existsSync(d))
  if (finalDir && statSync(finalDir).isDirectory()) {
    readdirSync(finalDir)
      .filter((name) => name.endsWith('.json') && name !== 'summary.json')
      .forEach((name) => rewrite(path.join(finalDir, name)))
  }
}

function readLiveManifestIfExists(filePath: string): any {
  if (!existsSync(filePath)) return null
  const raw = readFileSync(filePath, 'utf-8')
  const match = raw.match(/window\.__SPARROW_LIVE_MANIFEST\s*=\s*(\{[\s\S]*\})\s*;/)
  if (!match) return null
  return JSON.parse(match[1])
}

function countPlacedItemsInSvg(svgText: string): number {
  const text = String(svgText || '')
  const matches = text.match(/<use\b[^>]*href="#item_[^"]+"/g)
  return matches ? matches.length : 0
}

function collectStripSvgsFromDir(baseDir: string | null, { isPreview }: { isPreview: boolean }): any[] {
  if (!baseDir || !existsSync(baseDir)) return []

  const stripDirs = readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^strip_\d+$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort()

  if (stripDirs.length) {
    return stripDirs.map((dirName) => {
      const stripDir = path.join(baseDir, dirName)
      const svgFiles = readdirSync(stripDir)
        .filter((name) => name.toLowerCase().endsWith('.svg'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      const latest = svgFiles[svgFiles.length - 1]
      if (!latest) return null
      const svgPath = path.join(stripDir, latest as string)
      const svgText = readFileSync(svgPath, 'utf-8')
      return {
        index: Number(dirName.match(/\d+/)?.[0] || 0),
        svg_path: svgPath,
        json_path: null,
        svg: svgText,
        item_count: countPlacedItemsInSvg(svgText),
        is_preview: isPreview
      } as any
    }).filter(Boolean)
  }

  const flatSvgFiles = readdirSync(baseDir)
    .filter((name) => name.toLowerCase().endsWith('.svg'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const latestFlat = flatSvgFiles[flatSvgFiles.length - 1]
  if (!latestFlat) return []

  const svgPath = path.join(baseDir, latestFlat)
  const stripWidthMatch = latestFlat.match(/^\d+_([-\d.]+)_/)
  const stripWidth = stripWidthMatch ? Number(stripWidthMatch[1]) : null
  const svgText = readFileSync(svgPath, 'utf-8')

  return [{
    index: 1,
    svg_path: svgPath,
    json_path: null,
    svg: svgText,
    strip_width: Number.isFinite(stripWidth) ? stripWidth : null,
    item_count: countPlacedItemsInSvg(svgText),
    is_preview: isPreview
  }]
}


function collectRootFinalSvgPreview(outputDir: string, safeName: string) {
  if (!outputDir || !existsSync(outputDir)) return null
  const finalSvgPath = path.join(outputDir, `final_${safeName}.svg`)
  if (!existsSync(finalSvgPath)) return null
  const svgText = readFileSync(finalSvgPath, 'utf-8')
  return {
    summaryPath: finalSvgPath,
    summary: {
      name: safeName,
      strip_count: 1,
      strips: [{ index: 1, svg_path: finalSvgPath, json_path: null, svg: svgText, item_count: countPlacedItemsInSvg(svgText), is_preview: true }],
      is_preview: true
    }
  }
}

function collectLiveArtifacts(runDir: string, safeName: string) {
  try {
    const manifestPath = path.join(runDir, 'output', `final_${safeName}.json`)
    const manifest = readLiveManifestIfExists(manifestPath)
    if (manifest) {
      return {
        summaryPath: manifestPath,
        summary: {
          name: manifest.name || safeName,
          strip_count: Number(manifest.strip_count) || 1,
          strips: Array.isArray(manifest.strips) ? manifest.strips : [],
          is_preview: true
        }
      }
    }
  } catch {
    // Ignore transient live-preview read failures while Sparrow is still writing files.
  }
  return null
}

function collectRunningSparrowArtifacts(runDir: string, safeName: string) {
  try {
    const liveArtifacts = collectLiveArtifacts(runDir, safeName)
    if (liveArtifacts?.summary?.strips?.length) return liveArtifacts
  } catch {
    // Ignore transient live-preview read failures while Sparrow is still writing files.
  }

  try {
    const strips = collectStripSvgsFromDir(path.join(runDir, 'output'), { isPreview: true })
    if (strips.length) {
      return {
        summaryPath: null,
        summary: { name: safeName, strip_count: strips.length, strips, is_preview: true }
      }
    }
  } catch {
    // Ignore transient live-preview read failures while Sparrow is still writing files.
  }

  try {
    const rootPreview = collectRootFinalSvgPreview(path.join(runDir, 'output'), safeName)
    if (rootPreview?.summary?.strips?.length) return rootPreview
  } catch {
    // Ignore transient root-preview read failures while Sparrow is still writing files.
  }

  try {
    const artifacts = collectSparrowArtifacts(runDir, safeName)
    if (artifacts?.summary?.strips?.length) return { ...artifacts, summary: { ...artifacts.summary, is_preview: true, strips: artifacts.summary.strips.map((strip: any) => ({ ...strip, is_preview: true })) } }
  } catch {
    // Ignore transient artifact read failures while Sparrow is still writing files.
  }

  return { summaryPath: null, summary: null }
}

function collectSparrowArtifacts(runDir: string, safeName: string) {
  const outputDir = path.join(runDir, 'output')
  const finalDir = path.join(outputDir, `final_${safeName}`)
  if (existsSync(finalDir) && statSync(finalDir).isDirectory()) {
    const summaryPath = path.join(finalDir, 'summary.json')
    const summary = readJsonIfExists(summaryPath)
    if (summary?.strips?.length) {
      const mappedSummary = compactLastStripArtifacts({
        ...summary,
        strips: summary.strips.map((strip: any) => {
          const svgPath = path.resolve(runDir, strip.svg_path)
          const jsonPath = path.resolve(runDir, strip.json_path)
          const placedItemCounts = readPlacedItemCounts(jsonPath)
          return {
            ...strip,
            svg_path: svgPath,
            json_path: jsonPath,
            placed_item_counts: placedItemCounts,
            placed_item_ids: placedItemCounts.map((item) => item.item_id)
          }
        })
      })
      return { summaryPath, summary: mappedSummary }
    }
    return { summaryPath, summary: summary?.strips?.length ? { name: safeName, strip_count: summary.strips.length, strips: summary.strips } : null }
  }

  return { summaryPath: null, summary: null }
}



function terminateSparrowRun(runId: string, { markStopped = true, forceAfterMs = 2000 } = {}): boolean {
  const child = activeSparrowProcesses.get(runId)
  if (!child) return false
  try {
    child.kill('SIGTERM')
    if (forceAfterMs > 0) {
      setTimeout(() => {
        if (activeSparrowProcesses.has(runId)) child.kill('SIGKILL')
      }, forceAfterMs)
    }
    const run = sparrowRuns.get(runId)
    if (run && markStopped) run.status = 'stopped'
    return true
  } catch {
    return false
  }
}

function terminateAllSparrowRuns(options: { markStopped?: boolean; forceAfterMs?: number } = {}): void {
  for (const runId of activeSparrowProcesses.keys()) terminateSparrowRun(runId, options)
}

export function registerSparrowIpc(): void {
  app.on('before-quit', () => terminateAllSparrowRuns({ markStopped: true, forceAfterMs: 1000 }))

  ipcMain.handle('get-native-engine-info', async (): Promise<NativeEngineInfo> => {
    try {
      const sparrowPath = resolveNativeExecutable('sparrow')
      return { success: true, platform: process.platform, arch: process.arch, sparrowPath, sparrowExists: existsSync(sparrowPath) }
    } catch {
      return { success: false, platform: process.platform, arch: process.arch, sparrowPath: '', sparrowExists: false }
    }
  })

  ipcMain.handle('run-sparrow', async (_event, payload: SparrowPayload, options: SparrowOptions = {}): Promise<SparrowResult> => {
    const runId = `sparrow_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const { timeoutMs = 60000, collectArtifacts = false } = options

    try {
      const sparrowPath = resolveNativeExecutable('sparrow')
      const workDir = path.join(app.getPath('temp'), `nestkit_sparrow_${runId}`)
      await fs.mkdir(workDir, { recursive: true })

      const inputPath = path.join(workDir, 'input.json')
      await fs.writeFile(inputPath, JSON.stringify(payload, null, 2), 'utf-8')

      const args: string[] = []
      if (isDevMode() && process.env.SPARROW_CARGO_MANIFEST_PATH) {
        const cargoCmd = buildCargoRunCommand([inputPath])
        void cargoCmd
      }
      args.push('--input', inputPath)
      if (payload.globalTime != null) args.push('--global-time', String(payload.globalTime))
      if (payload.rngSeed != null) args.push('--rng-seed', String(payload.rngSeed))
      if (payload.earlyTermination != null) args.push('--early-termination', String(payload.earlyTermination))
      if (payload.maxStripLength != null) args.push('--max-strip-length', String(payload.maxStripLength))
      if (payload.stripMargin != null) args.push('--strip-margin', String(payload.stripMargin))
      if (payload.minItemSeparation != null) args.push('--min-item-separation', String(payload.minItemSeparation))
      if (payload.bucketFillWeight != null) args.push('--bucket-fill-weight', String(payload.bucketFillWeight))
      if (payload.multiStripMode === 'barriers' || payload.multiStripMode === 'prebucket') args.push('--multi-strip-mode', payload.multiStripMode)
      if (payload.alignX != null) args.push('--align-x', String(payload.alignX))
      if (payload.alignY != null) args.push('--align-y', String(payload.alignY))
      if (payload.alignMode != null) args.push('--align-mode', String(payload.alignMode))
      if (collectArtifacts) args.push('--artifacts')

      const [cmd, spawnArgs] = buildSpawnCommand(sparrowPath, args)
      const child = spawn(cmd, spawnArgs, { cwd: workDir, stdio: ['ignore', 'pipe', 'pipe'] })
      activeSparrowProcesses.set(runId, child)

      const safeName = String(payload.name || 'nest').replace(/[^a-zA-Z0-9_-]/g, '_')
      sparrowRuns.set(runId, { status: 'running', runDir: workDir, safeName, inputPath, stdout: '', stderr: '' })

      let stdoutData = ''
      let stderrData = ''
      child.stdout?.on('data', (data) => {
        stdoutData += data.toString()
        const run = sparrowRuns.get(runId)
        if (run) run.stdout = stdoutData
      })
      child.stderr?.on('data', (data) => {
        stderrData += data.toString()
        const run = sparrowRuns.get(runId)
        if (run) run.stderr = stderrData
      })

      const timeout = setTimeout(() => {
        if (activeSparrowProcesses.has(runId)) {
          try {
            child.kill('SIGTERM')
            setTimeout(() => {
              if (activeSparrowProcesses.has(runId)) child.kill('SIGKILL')
            }, 2000)
          } catch {
            // Ignore kill errors
          }
          const run = sparrowRuns.get(runId)
          if (run) {
            run.status = 'timeout'
            run.error = 'Sparrow process timed out'
          }
        }
      }, timeoutMs)

      child.on('close', async (code) => {
        clearTimeout(timeout)
        activeSparrowProcesses.delete(runId)
        const run = sparrowRuns.get(runId)
        if (!run || run.status === 'timeout' || run.status === 'stopped') return
        run.exitCode = code ?? null

        if (code !== 0) {
          run.status = 'failed'
          run.error = `Sparrow exited with code ${code}. Stderr: ${stderrData.substring(0, 500)}`
          return
        }

        try {
          let resultStr = stdoutData
          const lastBrace = stdoutData.lastIndexOf('}')
          if (lastBrace !== -1) resultStr = stdoutData.substring(0, lastBrace + 1)
          let parsedResult = JSON.parse(resultStr)
          if (collectArtifacts) {
            try {
              parsedResult = compactLastStripArtifacts(parsedResult as any)
            } catch (e) {
              console.error('Failed to compact artifacts:', e)
            }
          }

          run.status = 'completed'
          run.result = parsedResult
          run.summary = parsedResult?.summary || parsedResult

          if (collectArtifacts) {
            try {
              const artifacts = collectSparrowArtifacts(workDir, safeName)
              if (artifacts?.summary) {
                run.summary = artifacts.summary
                run.summaryPath = artifacts.summaryPath || null
                run.artifacts = [artifacts.summary]
              }
            } catch {
              // Artifact collection is optional, don't fail the run
            }
          }

          if (code === 0) rewriteTailIdMapping(workDir, safeName, inputPath)
        } catch (err) {
          run.status = 'failed'
          if (collectArtifacts) {
            try {
              const artifacts = collectSparrowArtifacts(workDir, safeName)
              if (artifacts?.summary) {
                run.status = 'completed'
                run.result = artifacts.summary
                run.summary = artifacts.summary
                run.summaryPath = artifacts.summaryPath || null
                run.artifacts = [artifacts.summary]
                return
              }
            } catch {
              // Fall through to error
            }
          }
          run.error = `Failed to parse Sparrow output: ${(err as Error).message}`
        }
      })

      child.on('error', (err) => {
        clearTimeout(timeout)
        activeSparrowProcesses.delete(runId)
        const run = sparrowRuns.get(runId)
        if (run) {
          run.status = 'failed'
          run.error = `Failed to start Sparrow: ${err.message}`
        }
      })

      return { success: true, runId }
    } catch (err) {
      sparrowRuns.set(runId, { status: 'failed', error: (err as Error).message, runDir: '', safeName: String(payload.name || 'nest').replace(/[^a-zA-Z0-9_-]/g, '_') })
      return { success: false, runId, error: (err as Error).message }
    }
  })

  ipcMain.handle('poll-sparrow', async (_event, runId: string): Promise<SparrowPollResult> => {
    const run = sparrowRuns.get(runId)
    if (!run) return { success: false, status: 'failed', error: 'Run not found' }

    const artifacts = collectRunningSparrowArtifacts(run.runDir, run.safeName)
    const summary = run.summary || run.result || artifacts?.summary || null
    const summaryPath = run.summaryPath || artifacts?.summaryPath || null

    return {
      success: true,
      status: run.status,
      result: summary,
      summary,
      summaryPath,
      runDir: run.runDir,
      exitCode: run.exitCode ?? null,
      artifacts: run.artifacts,
      inputPath: run.inputPath,
      stdout: run.stdout,
      stderr: run.stderr,
      error: run.error
    }
  })

  ipcMain.handle('stop-sparrow', async (_event, runId?: string): Promise<{ success: boolean; stopped: boolean; error?: string }> => {
    try {
      const stopped = runId ? terminateSparrowRun(runId, { markStopped: true, forceAfterMs: 2000 }) : (terminateAllSparrowRuns({ markStopped: true, forceAfterMs: 2000 }), true)
      return { success: true, stopped }
    } catch (err) {
      return { success: false, stopped: false, error: (err as Error).message }
    }
  })
}

export function hasExportableFinalSummary(run: SparrowRun): boolean {
  return run.status === 'completed' && !!run.result
}

export async function awaitCompletedArtifacts(runId: string): Promise<unknown[]> {
  const run = sparrowRuns.get(runId)
  if (!run || run.status !== 'completed') return []
  return run.artifacts || []
}
