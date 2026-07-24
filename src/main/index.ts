import { app } from 'electron'

// Disable hardware acceleration before any Electron modules load
app.disableHardwareAcceleration()

// Import from newly converted TypeScript modules
import { initializeApp, getMainWindow, registerAppMenuIpc } from './app'
import { registerFileIpc } from './ipc/files'
import { registerSparrowIpc } from './ipc/sparrow'
import { registerExportDxfIpc } from './ipc/export-dxf'

const isDevMode = process.argv.includes('--dev') || process.argv.includes('--devtools')

// Register all IPC handlers before app ready
registerFileIpc({ getMainWindow })
registerAppMenuIpc()
registerSparrowIpc()
registerExportDxfIpc()

// Initialize the Electron app
initializeApp({ isDevMode })
