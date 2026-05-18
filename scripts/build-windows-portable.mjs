import { spawn, spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const builderCli = path.join(rootDir, 'node_modules', 'electron-builder', 'cli.js')
const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'))
const version = packageJson.version
const outputDir = path.join(rootDir, 'release', 'beta', version)
const workOutputDir = path.join(outputDir, `portable-work-${process.pid}`)
const portablePath = path.join(outputDir, `Eqoustics-Beta-Windows-Portable-${version}.exe`)
const workPortablePath = path.join(workOutputDir, `Eqoustics-Beta-Windows-Portable-${version}.exe`)
const portableNsisSourcePath = path.join(rootDir, 'scripts', 'portable.nsi')
const portableNsisTemplatePath = path.join(rootDir, 'node_modules', 'app-builder-lib', 'templates', 'nsis', 'portable.nsi')
const portablePythonPath = path.join(rootDir, '.eqoustics-python-portable', 'python.exe')
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

console.log('[Eqoustics] Packaging seamless Windows x64 portable executable...')
console.log('[Eqoustics] Portable packaging can take a while because the embedded Python runtime is large.')

async function patchPortableNsisTemplate() {
  await copyFile(portableNsisSourcePath, portableNsisTemplatePath)
}

async function removeStaleReleaseArtifacts() {
  const staleOutputNames = new Set([
    '__appImage-x64',
    '__uninstaller-nsis-eqoustics.exe',
    'builder-debug.yml',
    'builder-effective-config.yaml',
    `Eqoustics-Beta-Windows-Setup-${version}.exe`,
    `Eqoustics-Beta-Windows-Setup-${version}.exe.blockmap`,
    'latest.yml',
    'linux-unpacked',
    'win-unpacked',
  ])

  const entries = await readdir(outputDir, { withFileTypes: true })
  await Promise.all(entries.map(async (entry) => {
    if (!entry.name.startsWith('portable-work-') && !staleOutputNames.has(entry.name)) {
      return undefined
    }

    const artifactPath = path.join(outputDir, entry.name)
    try {
      await rm(artifactPath, { recursive: true, force: true })
    } catch (error) {
      console.warn(`[Eqoustics] Could not remove stale release artifact ${entry.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }))
}

function verifyPortablePythonRuntime() {
  if (!existsSync(portablePythonPath)) {
    throw new Error('[Eqoustics] LiteRT portable Python runtime is missing. Run npm run prepare:python before packaging.')
  }

  const result = spawnSync(portablePythonPath, ['-B', '-c', 'import litert_lm'], {
    cwd: rootDir,
    stdio: 'pipe',
    encoding: 'utf8',
    shell: false,
  })

  if (result.status !== 0) {
    throw new Error(`[Eqoustics] LiteRT portable Python runtime is not ready.\n${result.stderr || result.stdout}`)
  }
}

await mkdir(outputDir, { recursive: true })
await removeStaleReleaseArtifacts()
await rm(workOutputDir, { recursive: true, force: true })
verifyPortablePythonRuntime()
await patchPortableNsisTemplate()

const env = { ...process.env, ELECTRON_BUILDER_COMPRESSION: 'store' }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [
  builderCli,
  '--win',
  `-c.directories.output=${path.relative(rootDir, workOutputDir)}`,
], {
  cwd: rootDir,
  env,
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
      await rm(workOutputDir, { recursive: true, force: true })
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
