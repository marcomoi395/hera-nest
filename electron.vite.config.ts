import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: [
          // Keep native modules external - they use N-API bindings
          'to-planar-graph',
          'planar-face-discovery',
          '@tarikjabiri/dxf',
          'dxf-parser',
          '@flatten-js/core',
          'jsts',
          'concaveman'
        ]
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        'jsts/dist/jsts.min.js': resolve(__dirname, 'node_modules/jsts/dist/jsts.min.js')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
