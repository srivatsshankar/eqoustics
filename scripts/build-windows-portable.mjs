import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const builderCli = path.join(rootDir, 'node_modules', 'electron-builder', 'cli.js')
const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'))
const version = packageJson.version
const outputDir = path.join(rootDir, 'release', 'beta', version)
const workOutputDir = path.join(outputDir, `portable-work-${process.pid}`)
const portablePath = path.join(outputDir, `Eqoustics-Beta-Windows-Portable-${version}.exe`)
const workPortablePath = path.join(workOutputDir, `Eqoustics-Beta-Windows-Portable-${version}.exe`)
const startedAt = Date.now()

function elapsedSeconds() {
  return Math.round((Date.now() - startedAt) / 1000)
}

function portableSizeText() {
  if (!existsSync(workPortablePath)) return ''

  const portableStat = statSync(workPortablePath)
  if (portableStat.mtimeMs < startedAt - 1000) return ''

  const sizeGb = portableStat.size / 1024 / 1024 / 1024
  return ` current portable file: ${sizeGb.toFixed(2)} GB`
}

console.log('[Eqoustics] Packaging Windows x64 app folder and portable executable...')
console.log('[Eqoustics] Portable packaging can take a while because the embedded Python runtime is large.')

await mkdir(outputDir, { recursive: true })
await rm(workOutputDir, { recursive: true, force: true })

const child = spawn(process.execPath, [
  builderCli,
  '--win',
  `-c.directories.output=${path.relative(rootDir, workOutputDir)}`,
], {
  cwd: rootDir,
  env: {
    ...process.env,
    ELECTRON_BUILDER_COMPRESSION: 'store',
  },
  stdio: 'inherit',
})

const heartbeat = setInterval(() => {
  console.log(`[Eqoustics] Still packaging... elapsed ${elapsedSeconds()}s.${portableSizeText()}`)
}, 30_000)

child.on('error', (error) => {
  clearInterval(heartbeat)
  console.error(`[Eqoustics] Failed to start electron-builder: ${error.message}`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  clearInterval(heartbeat)

  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  if (code === 0) {
    void (async () => {
      await copyFile(workPortablePath, portablePath)
      console.log(`[Eqoustics] Windows packaging finished in ${elapsedSeconds()}s.`)
      console.log(`[Eqoustics] Output: ${path.relative(rootDir, portablePath)}`)
      process.exit(0)
    })().catch((error) => {
      console.error(`[Eqoustics] Failed to copy portable executable: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    })
    return
  }

  process.exit(code ?? 0)
})
