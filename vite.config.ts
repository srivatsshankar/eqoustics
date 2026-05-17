import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

function vadAssetContentType(fileName: string) {
  if (fileName.endsWith('.wasm')) return 'application/wasm'
  if (fileName.endsWith('.mjs') || fileName.endsWith('.js')) return 'text/javascript'
  if (fileName.endsWith('.onnx')) return 'application/octet-stream'
  return 'application/octet-stream'
}

function vadAssetsPlugin() {
  const vadDist = path.join(__dirname, 'node_modules', '@ricky0123', 'vad-web', 'dist')
  const ortDist = path.join(__dirname, 'node_modules', 'onnxruntime-web', 'dist')
  const assetFiles = [
    { source: path.join(vadDist, 'vad.worklet.bundle.min.js'), fileName: 'vad/vad.worklet.bundle.min.js' },
    { source: path.join(vadDist, 'silero_vad_v5.onnx'), fileName: 'vad/silero_vad_v5.onnx' },
    { source: path.join(vadDist, 'silero_vad_legacy.onnx'), fileName: 'vad/silero_vad_legacy.onnx' },
    ...fs.readdirSync(ortDist)
      .filter((fileName) => /^ort-wasm.*\.(?:wasm|mjs)$/.test(fileName))
      .map((fileName) => ({ source: path.join(ortDist, fileName), fileName: `vad/${fileName}` })),
  ]

  return {
    name: 'eqoustics-vad-assets',
    configureServer(server) {
      server.middlewares.use('/vad/', (request, response, next) => {
        const requestPath = decodeURIComponent((request.url ?? '').replace(/[?#].*$/, '').replace(/^\//, ''))
        const asset = assetFiles.find((candidate) => path.basename(candidate.fileName) === requestPath)
        if (!asset) {
          next()
          return
        }

        response.setHeader('content-type', vadAssetContentType(requestPath))
        fs.createReadStream(asset.source)
          .on('error', next)
          .pipe(response)
      })
    },
    generateBundle() {
      for (const asset of assetFiles) {
        this.emitFile({
          type: 'asset',
          fileName: asset.fileName,
          source: fs.readFileSync(asset.source),
        })
      }
    },
  }
}

function appIconPlugin() {
  const iconPath = path.join(__dirname, 'build', 'icon.png')

  return {
    name: 'eqoustics-app-icon',
    configureServer(server) {
      server.middlewares.use('/icon.png', (_request, response, next) => {
        if (!fs.existsSync(iconPath)) {
          next()
          return
        }

        response.setHeader('content-type', 'image/png')
        fs.createReadStream(iconPath)
          .on('error', next)
          .pipe(response)
      })
    },
    generateBundle() {
      if (!fs.existsSync(iconPath)) {
        return
      }

      this.emitFile({
        type: 'asset',
        fileName: 'icon.png',
        source: fs.readFileSync(iconPath),
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    appIconPlugin(),
    vadAssetsPlugin(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer: process.env.NODE_ENV === 'test'
        // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
        ? undefined
        : {},
    }),
  ],
})
