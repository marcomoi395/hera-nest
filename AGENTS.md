
# Repository Guidelines

## Project Overview
This is a DXF Nesting Application ("Hera Nest") built with Electron, Vite, TypeScript, and React/Vanilla JS (renderer). It processes DXF files, detects shapes, and runs a native binary (`sparrow`) to perform 2D nesting optimization.

## Architecture & Data Flow
- **Main Process (`src/main`):** Node.js backend handling system integration, file I/O, IPC handlers, native binary orchestration (spawning `sparrow`), and macOS App Sandbox bookmarks.
- **Renderer Process (`src/renderer`):** Browser context handling UI rendering, state management (single reactive state object with debounced persistence), canvas visualization, and user interactions.
- **Preload (`src/preload`):** Context bridge exposing the `electron-api` safely to the renderer.
- **Shared/Types (`src/shared`, `src/types`):** Shared constants and TypeScript definitions ensuring IPC contract safety.

**Key Data Flows:**
1. **Import:** Renderer requests DXF parse -> Main parses -> Renderer gets geometry.
2. **Nesting:** Renderer builds job -> Main spawns `sparrow` -> Main polls live artifacts -> Renderer updates UI.
3. **Export:** Renderer prepares export metadata -> Main synthesizes layers/engraving and writes DXF.
4. **Persistence:** State mutations debounced (120ms) -> Saved to disk via IPC.

## Key Directories
- `src/main/`: Main process entry (`app.ts`), IPC handlers (`ipc/`), system utilities.
- `src/renderer/`: UI entry (`renderer.ts`), views, services, state management.
- `src/renderer/services/`: Business logic (DXF processing, nesting orchestration).
- `src/renderer/views/`: UI components (modals, panes, canvas).
- `native/`: Platform-specific native binaries (`sparrow`).

## Development Commands
- `bun run dev`: Start development server (electron-vite).
- `bun run build`: Build the application (typecheck + vite build).
- `bun run typecheck`: Run TypeScript compilation check for node and web configs.
- `bun run lint`: Run ESLint.
- `bun run build:mac` / `build:win` / `build:linux`: Platform-specific packaging via electron-builder.

## Code Conventions & Common Patterns
- **Services:** Factory-based services with dependency injection via closure (e.g., `createDxfService()`).
- **State Management:** Single global state object mutated directly, followed by explicit `saveState()` (debounced). No Redux.
- **IPC Protocol:** Standardized result objects: `{ success: boolean, data?: T, error?: string }`.
- **Async:** Prefer `ipcRenderer.invoke` (async) over `sendSync` (used rarely for geometry).
- **Naming:** `kebab-case` for files, `camelCase` for functions and variables.
- **Error Handling:** Catch in IPC handlers and return standardized error payloads rather than throwing to renderer.

## Important Files
- `package.json`: Defines scripts, dependencies, and electron-builder config.
- `electron.vite.config.ts`: Vite configuration for main, preload, and renderer.
- `src/main/app.ts`: Main process entry point, app lifecycle, menu construction.
- `src/renderer/renderer.ts`: Renderer entry point.
- `src/types/electron-api.d.ts`: Defines the `window.api` interface (crucial for IPC types).

## Runtime/Tooling Preferences
- **Package Manager:** Bun.
- **Build Tool:** `electron-vite` for dev/build, `electron-builder` for packaging.
- **Linting/Formatting:** ESLint + Prettier (`@electron-toolkit` preset).
- **External Dependencies:** Geometry/DXF libraries are kept external in the build config to preserve N-API bindings if present.

## Testing & QA
- **Current State:** No automated test suite exists.
- **Verification:** Rely on TypeScript strict mode (`typecheck`), ESLint (`lint`), and manual smoke testing.
- **Guidelines for AI:** Since there are no tests, verify changes by ensuring `bun run typecheck` and `bun run build` pass.
