## Context
Người dùng yêu cầu lọc các phần cần bổ sung để tiếp tục migration từ `legacy/` pure Electron sang Vite + TypeScript. End state: app hiện tại dưới `src/` chạy được toàn bộ workflow như `legacy/`: import DXF, detect/preview shapes, chạy Sparrow nesting, xem live/final strips, export DXF production với layer/entity/engraving/debug metadata tương đương legacy, build/package bằng electron-vite/electron-builder.

Các gap đã được xác nhận bằng đọc code: `src/main/ipc/export-dxf.ts` chỉ 163 dòng so với `legacy/main/ipc/export-dxf.js` 1,172 dòng; `src/renderer/services/dxf-shape-detection-service.ts` và `src/renderer/services/dxf-raster-envelope-service.ts` đang là stub; `src/renderer/src/main.ts` chỉ attach `NestConstants`, `NestSettings`, `NestEngravingLayout` lên `window`, trong khi nhiều service vẫn đọc `window.Nest*`; `src/main/ipc/sparrow.ts` bỏ nhiều CLI args/lifecycle fields từ `legacy/main/ipc/sparrow.js`.

## Approach
Thực hiện theo phase nhỏ, mỗi phase để app vẫn typecheck được trước khi sang phase sau. Không redesign UI/API; port tối thiểu logic legacy sang TypeScript, dùng `any` ở các module port lớn để tránh refactor ngoài phạm vi.

### Phase 1 — Restore renderer globals and vendor runtime wiring
1. Edit `src/renderer/src/main.ts` before `initializeRenderer` import/run. Import and attach vendor libraries already present in `package.json`: `import * as Flatten from '@flatten-js/core'`, `import * as jsts from 'jsts'`, `import concaveman from 'concaveman'`; assign `(window as any).Flatten = Flatten`, `(window as any).jsts = jsts`, `(window as any).concaveman = concaveman`. If the `concaveman` default import fails typecheck, replace it with `import * as concavemanModule from 'concaveman'` and assign `(window as any).concaveman = (concavemanModule as any).default || concavemanModule`.
2. In the same file, import namespace modules and attach them in the legacy script order used by `legacy/renderer/index.html:632-674`: `../../shared/constants` as `window.NestConstants`, `../../shared/settings` as `window.NestSettings`, `../../shared/engraving-layout` as `window.NestEngravingLayout`, `../helpers` as `window.NestHelpers`, `../utils/dxf-color` as `window.NestDxfColor`, `../utils/dxf-geometry` as `window.NestDxfGeometry`, `../utils/dxf-svg` as `window.NestDxfSvg`, `../utils/dxf-preview-state` as `window.NestDxfPreviewState`, `../utils/nest-result-scoring` as `window.NestResultScoring`, `../utils/tail-refinement` as `window.NestTailRefinement`, `../utils/contour-helpers` as `window.NestDxfContourHelpers`.
3. Still in `src/renderer/src/main.ts`, attach service API objects expected by existing code: `window.NestDxfLayerService = { createLayerResolver, FALLBACK_PALETTE }`, `window.NestDxfExportMetadataService = { serializePoint, serializeEntityForExport }`, `window.NestDxfEngravingPreviewService = { LABEL_OUTLINE_FONT, LABEL_STROKE_FONT, buildPreviewLabelSvg }`, `window.NestDxfFlattenService = { buildSketchGroups, extractPolygonForEntities }`, `window.NestDxfContourDetectionService = { detectContour }`.
4. Leave `window.NestDxfShapeDetectionService`, `window.NestDxfRasterEnvelopeService`, and `window.NestDxfShapeStructureService` unwired until Phase 2 restores their real factories; do not attach the current stubs as final behavior.
5. If TypeScript reports missing module declarations for `jsts` or `concaveman`, create `src/types/vendor.d.ts` with exactly `declare module 'jsts';` and `declare module 'concaveman';`. Do not add dependencies; they already exist in `package.json:26-30`.

### Phase 2 — Restore DXF shape/raster detection algorithms
1. Replace `src/renderer/services/dxf-shape-detection-service.ts` stub with a direct TypeScript port of `legacy/renderer/services/dxf-shape-detection-service.js`. Keep exported named `debugDXF(label: string, payload: any): void`. Add `export function createDxfShapeDetectionService(deps: { geometry: any; svg: any; concaveman?: any })` returning exactly the legacy API keys from `legacy/renderer/services/dxf-shape-detection-service.js:1961-1981`: `DXF_DEBUG`, `debugDXF`, `isClosedEntity`, `contourEntityToPoints`, `contourEntityToPath`, `buildClosedContoursFromLines`, `contourContainsContour`, `contourDepth`, `contourPreferenceScore`, `compareContourPreference`, `groupByContour`, `lineLoopToSVGPath`, `sampleEntityPoints`, `computeConvexHull`, `circumradius`, `bowyerWatson`, `estimateAlpha`, `computeAlphaShape`, `buildAlphaShapeContours`.
2. In that port, replace IIFE globals with `const geometry = deps.geometry`, `const svg = deps.svg`, `const concaveman = deps.concaveman || (window as any).concaveman`; keep debug store key literal `__NEST_DXF_DEBUG__` and `DXF_DEBUG = true` from legacy. Preserve fallback behavior: if `geometry` or `svg` is missing, return no-op/empty outputs matching legacy fallback, not thrown errors.
3. Replace `src/renderer/services/dxf-raster-envelope-service.ts` stub with a direct TypeScript port of `legacy/renderer/services/dxf-raster-envelope-service.js`. Keep `export function createDxfRasterEnvelopeService(deps: { geometry: any; shapeDetectionService?: any })` returning `{ buildRasterEnvelopes, detectRasterShapes }`. Function outputs must match legacy: `buildRasterEnvelopes(entities, options?)` returns regions with `id`, `entities`, `polygonPoints`, `bbox`, `layer`, `cellCount`; `detectRasterShapes(entities, options?)` returns shapes with `id`, `layer`, `entities`, `polygonPoints`, `bbox`, `source: 'raster-envelope'`.
4. Complete bootstrap wiring in `src/renderer/src/main.ts` by assigning `window.NestDxfShapeDetectionService = createDxfShapeDetectionService({ geometry: window.NestDxfGeometry, svg: window.NestDxfSvg, concaveman: window.concaveman })`, `window.NestDxfRasterEnvelopeService = createDxfRasterEnvelopeService({ geometry: window.NestDxfGeometry, shapeDetectionService: window.NestDxfShapeDetectionService })`, `window.NestDxfShapeStructureService = createDxfShapeStructureService({ geometry: window.NestDxfGeometry, flattenService: window.NestDxfFlattenService, shapeDetectionService: window.NestDxfShapeDetectionService, rasterEnvelopeService: window.NestDxfRasterEnvelopeService })` before `initializeRenderer()` runs.
5. Do not port `legacy/renderer/services/contour-detection-jsts-service-v1.js` or `v2.js` as separate files in this phase. Current `src/renderer/services/contour-detection-jsts-service.ts` exists and is wired by direct ES import in `contour-detection-service.ts`; legacy variants are historical backups unless a later verification finds a contour regression. If regression appears only for arrangement contour, fallback is to port the specific missing branch from `legacy/renderer/services/contour-detection-jsts-service.js`, not add unused v1/v2 globals.

### Phase 3 — Restore production DXF export parity
1. Replace the simplified implementation inside `src/main/ipc/export-dxf.ts` with a TypeScript port of `legacy/main/ipc/export-dxf.js`. Keep IPC channel literal `export-sheets-dxf` and handler input shape from legacy: `{ outputDir, outputDirBookmark, jobName, inputPath, settings: currentSettings = null, exportItems = {}, strips }`. Also accept current renderer alias `outputPath` by normalizing `const outputDir = payload.outputDir || payload.outputPath`; do not require callers to choose.
2. Wrap the whole write operation in `withSecurityScopedAccess(outputDirBookmark, async () => { ... })` imported from `../utils/security-scoped-bookmarks`, matching `legacy/main/ipc/export-dxf.js:28`.
3. Port the legacy helper set, preserving names and behavior: `overwriteTextFile`, `normalizeDxfText`, `exportSheetFileBase`, `sanitizeDxfName`, `normalizeClosedPolylineVertices`, `entityColorCodes`, `pointsAlmostEqual`, `lineEndpoints`, `joinConnectedLineworkEntities`, `dxfEntityOptions`, `collectLayerDefs`, `buildStrokeLabelEntities`, `addDxfEntity`, `buildDXF`. Use `DxfWriter`, `point2d`, `point3d`, `LWPolylineFlags`, `PolylineFlags`, `SplineFlags`, `Units` from `@tarikjabiri/dxf` as in legacy import line 12.
4. Port engraving font data from `legacy/main/ipc/export-dxf.js:467-641` by reusing existing renderer font constants if practical: import `LABEL_OUTLINE_FONT` and `LABEL_STROKE_FONT` from `src/renderer/services/dxf-engraving-preview-service.ts` only if `tsconfig.node.json` can compile that import cleanly. If node typecheck rejects renderer import boundaries, copy the font constants into `src/main/ipc/export-dxf.ts` exactly from legacy. No new shared abstraction.
5. Return legacy result shape `{ success: true, fileCount, outputDir }`; also include current compatibility field `files` as an array of written DXF paths so `src/renderer/services/export-service.ts:282` keeps working. On error return `{ success: false, error: err.message }`.
6. Keep current renderer call in `src/renderer/services/export-service.ts` unless typecheck requires correcting `ExportPayload`: update `src/types/electron-api.d.ts` so `ExportPayload` declares optional `outputDir?: string`, `outputPath?: string`, `outputDirBookmark?: string | null`, `jobName?: string`, `inputPath?: string | null`, `settings?: unknown`, `exportItems?: unknown`, `strips?: unknown[]`, `sheets?: unknown[]`; update `ExportResult` to optional `fileCount?: number`, `outputDir?: string`, `files?: string[]`.

### Phase 4 — Restore Sparrow IPC parity
1. Edit `src/main/ipc/sparrow.ts` to match legacy path resolution from `legacy/main/ipc/sparrow.js:15-42`: `nativePlatformDir()` returns only `windows`, `macos`, or `process.platform`; `nativeBaseDir()` builds `['native', nativePlatformDir(), 'bin']`, checks packaged `process.resourcesPath`, then falls back to repo/dev path. Keep current dev fallback only if it resolves the same existing `native/<platform>/bin/sparrow` path.
2. Add legacy helpers from `legacy/main/ipc/sparrow.js:45-87`: `shellQuote(value)`, `resolveSparrowCargoManifestPath()`, `buildCargoRunCommand(args)`, `buildSpawnCommand(executablePath, args)`. Preserve env var names `SPARROW_CARGO_MANIFEST_PATH` and `NESTING_CARGO_MANIFEST_PATH` and fallback `../nesting/Cargo.toml`.
3. Add process lifecycle helpers from `legacy/main/ipc/sparrow.js:537-577`: `terminateSparrowRun(runId, { markStopped = true, forceAfterMs = 2000 } = {})` and `terminateAllSparrowRuns(options = {})`. Register `app.on('before-quit', () => terminateAllSparrowRuns({ markStopped: true, forceAfterMs: 1000 }))` inside `registerSparrowIpc()`.
4. Replace current `run-sparrow` argument construction with legacy args from `legacy/main/ipc/sparrow.js:624-662`: start with `['--input', inputPath]`; conditionally append `--global-time`, `--rng-seed`, `--early-termination`, `--max-strip-length`, `--strip-margin`, `--min-item-separation`, `--bucket-fill-weight`, `--multi-strip-mode barriers|prebucket`, and `--align-*`. Keep `--workers` commented out with the existing `ponytail:` comment because legacy intentionally did not enable it.
5. Restore run state shape fields `id`, `safeName`, `runDir`, `inputPath`, `stdout`, `stderr`, `status`, `exitCode`, `error`. On child close, set `exitCode`, set status to `completed`, `stopped`, or `error`, delete active process, and call `rewriteTailIdMapping(runDir, safeName, inputPath)` when code is `0`, matching `legacy/main/ipc/sparrow.js:708-724`.
6. Restore `stop-sparrow` return shape `{ success: true, stopped: boolean }` or `{ success: false, error }`, and `poll-sparrow` return fields `{ success, runId, status, runDir, inputPath, stdout, stderr, exitCode, summaryPath, summary, error }`, matching `legacy/main/ipc/sparrow.js:740-778`. Update `src/types/electron-api.d.ts` `SparrowOptions`, `SparrowResult`, `SparrowPollResult`, and `stopSparrow` API signature to include these fields; keep current caller compatibility by allowing `stopSparrow(runId?: string)`.

### Phase 5 — UI/API parity cleanup after restored internals
1. Re-read `src/renderer/views/*` and `src/renderer/services/*` only where typecheck or manual smoke identifies runtime errors. Do not refactor views preemptively: all 10 legacy view files have current TS counterparts, and the confirmed blocker is missing global wiring plus stub services.
2. Update `src/types/window.d.ts` to declare the window globals assigned in Phase 1: `NestDxfGeometry`, `NestDxfSvg`, `NestDxfColor`, `NestDxfLayerService`, `NestDxfShapeDetectionService`, `NestDxfFlattenService`, `NestDxfShapeStructureService`, `NestDxfRasterEnvelopeService`, `NestDxfContourDetectionService`, `NestDxfContourHelpers`, `NestDxfExportMetadataService`, `NestDxfPreviewState`, `NestResultScoring`, `NestTailRefinement`. Use `unknown` or `any` shapes; do not design full interfaces.
3. If `src/renderer/services/dxf-preview-service.ts` still reads `window.NestDxfShapeDetectionService` before Phase 1 bootstrap, move no code there; fix the import/bootstrap order in `src/renderer/src/main.ts` instead so all globals are assigned before `initializeRenderer()` is called.

### Phase 6 — Package/resource verification fixes only if checks fail
1. Keep `electron.vite.config.ts` externals as-is: current config externalizes `to-planar-graph`, `planar-face-discovery`, `@tarikjabiri/dxf`, `dxf-parser`, `@flatten-js/core`, `jsts`, `concaveman`.
2. Keep `electron-builder.yml` native resource layout as-is unless a packaged smoke test cannot find Sparrow. Current config copies Windows/Linux `native/<platform>` to resources and macOS `native/macos/bin/sparrow` to `Contents/Helpers/sparrow`; Phase 4 path resolution must match that.
3. Do not add a test framework. There is no existing test suite or test script; verification uses existing `npm run typecheck`, `npm run build`, `npm run build:unpack`, and a manual Electron smoke with a generated DXF fixture.

## Critical files & anchors
- `src/renderer/src/main.ts:1-21`: current bootstrap attaches only three shared globals; add vendor imports, utility/service globals, and factory instantiation before `initializeRenderer()`.
- `src/renderer/services/dxf-shape-detection-service.ts:1-9`: stub to replace with port of `legacy/renderer/services/dxf-shape-detection-service.js`, especially exported API at legacy lines `1961-1981`.
- `src/renderer/services/dxf-raster-envelope-service.ts:1-5`: stub to replace with port of `legacy/renderer/services/dxf-raster-envelope-service.js`, especially `buildRasterEnvelopes`/`detectRasterShapes` at legacy lines `432-503`.
- `src/main/ipc/export-dxf.ts:14-163`: simplified export handler to replace with legacy parity implementation from `legacy/main/ipc/export-dxf.js:16-1168`.
- `src/main/ipc/sparrow.ts:30-62,529-727`: path resolution, CLI args, lifecycle, polling/stop return shape to restore from `legacy/main/ipc/sparrow.js:15-87,537-778`.

## Verification
Run from repository root `/run/media/ym/DATA/Personal/hera-nest` after each phase that changes TypeScript:

1. Static checks after each phase:
   - `npm run typecheck`
   - If typecheck passes after Phase 3 and Phase 4, also run `npm run build`.

2. Renderer bootstrap smoke after Phase 1/2:
   - Start app: `npm run dev`.
   - Open DevTools console.
   - Expected: no `undefined`/`Cannot read properties of undefined` errors from `NestDxfGeometry`, `NestDxfSvg`, `NestDxfFlattenService`, `NestDxfShapeStructureService`, `NestDxfPreviewState`, `NestResultScoring`, or `NestTailRefinement` during startup.
   - Console check: `typeof window.NestDxfShapeDetectionService.buildClosedContoursFromLines === 'function'` and `typeof window.NestDxfRasterEnvelopeService.buildRasterEnvelopes === 'function'` both evaluate `true`.

3. Generate a deterministic DXF smoke fixture outside the repo:
   - Create `/tmp/hera-nest-smoke/simple-rectangle.dxf` with a single closed `LWPOLYLINE` rectangle on layer `0`. Use any CAD-valid ASCII DXF with one 100x60 rectangle; no repo fixture exists.
   - In the running app, click Add File, choose that DXF, open the DXF preview.
   - Expected: preview shows one detected part/shape, not blank; shape list contains one item; no debug console errors from contour/shape services.

4. Sparrow nesting smoke after Phase 4:
   - In the same app session, add one sheet larger than the part, for example width `300`, height `200`, fixed width.
   - Click Run.
   - Expected: status moves `Running…` then `Complete`; canvas shows at least one strip; export button becomes enabled for final non-preview result; DevTools/network logs show `poll-sparrow` summary includes `runDir`, `inputPath`, `summaryPath`, `stdout`, `stderr`, and `exitCode: 0`.

5. DXF export smoke after Phase 3/4:
   - Click Export, choose `/tmp/hera-nest-smoke/export`, click Export DXF.
   - Expected: label says `1 file saved to ...` or matching file count; exported filename follows legacy pattern like `01_sheet_<height>x<width>.dxf`, not `sheet_1.dxf`; output file exists; if app settings `exportDebug` is enabled then matching `.debug.json` is written, otherwise stale debug JSON is removed.
   - Inspect exported DXF text: it contains `SECTION`, `ENTITIES`, at least one `LWPOLYLINE`, sheet boundary layer, part layer/entity data, and engraving text/entity when `engravingLayer` is not `off`.

6. Packaging smoke after all phases:
   - `npm run build:unpack`
   - Run unpacked app from `dist-electron/*-unpacked/` for the current OS.
   - Expected: `window.electronAPI.getNativeEngineInfo()` returns `success: true` and `exists.sparrow === true` or `sparrowExists === true` depending on the final typed compatibility shape; run/export smoke above works in unpacked app.

## Assumptions & contingencies
- Assumption: target behavior is legacy feature parity, not a clean ES-module rewrite. Therefore large legacy algorithms should be ported directly with minimal typing and no new abstractions.
- Assumption: historical contour variants `contour-detection-jsts-service-v1.js` and `v2.js` are not active feature requirements because legacy `index.html` loads them before the main contour service but downstream runtime uses `NestDxfContourDetectionJstsService` from `contour-detection-jsts-service.js`. If smoke testing finds a contour regression, port missing code from the active legacy main contour file first; only port v1/v2 if a callsite explicitly references their unique symbols.
- If importing renderer engraving font constants into `src/main/ipc/export-dxf.ts` breaks node typecheck, copy the font constants into the main IPC file instead of creating a shared module. This avoids cross-bundle coupling.
- If `npm run dev` cannot open due environment/display constraints, run `npm run build` plus `npm run build:unpack`, then perform manual smoke in the unpacked app on a machine with GUI.
