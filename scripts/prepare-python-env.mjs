import { createWriteStream, existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import https from 'node:https'
import { createHash } from 'node:crypto'

const rootDir = process.cwd()
const venvDir = path.join(rootDir, '.eqoustics-python')
const packageVenvDir = path.join(rootDir, '.eqoustics-python-package')
const portablePythonDir = path.join(rootDir, '.eqoustics-python-portable')
const cacheDir = path.join(rootDir, '.eqoustics-python-cache')
const requirementsPath = path.join(rootDir, 'electron', 'python', 'requirements-speech.txt')
const runtimeStampName = '.eqoustics-speech-runtime.json'
const speechRuntimeProfile = 'litert-lm-only-v1'
const isWindows = process.platform === 'win32'
const venvPython = isWindows
  ? path.join(venvDir, 'Scripts', 'python.exe')
  : path.join(venvDir, 'bin', 'python')
const packageVenvPython = isWindows
  ? path.join(packageVenvDir, 'Scripts', 'python.exe')
  : path.join(packageVenvDir, 'bin', 'python')
const portablePython = path.join(portablePythonDir, 'python.exe')
const skipPortable = process.argv.includes('--skip-portable')
const forcePrepare = process.env.EQOUSTICS_FORCE_PYTHON_PREPARE === '1'
let requirementsHashCache = null

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: options.quiet ? 'pipe' : 'inherit',
    shell: false,
  })

  if (result.status === 0) {
    return result
  }

  if (options.optional) {
    return null
  }

  throw new Error(`[Eqoustics] Command failed: ${command} ${args.join(' ')}`)
}

function commandWorks(command, args = ['--version']) {
  return Boolean(run(command, args, { optional: true, quiet: true }))
}

function runOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    shell: false,
  })

  if (result.status !== 0) {
    throw new Error(`[Eqoustics] Command failed: ${command} ${args.join(' ')}\n${result.stderr ?? ''}`)
  }

  return result.stdout.trim()
}

async function speechRequirementsHash() {
  if (requirementsHashCache) return requirementsHashCache

  const requirements = existsSync(requirementsPath) ? await readFile(requirementsPath, 'utf8') : ''
  requirementsHashCache = createHash('sha256')
    .update(speechRuntimeProfile)
    .update('\n')
    .update(requirements)
    .digest('hex')
  return requirementsHashCache
}

function runtimeStampPath(targetDir) {
  return path.join(targetDir, runtimeStampName)
}

async function runtimeStampMatches(targetDir) {
  try {
    const stamp = JSON.parse(await readFile(runtimeStampPath(targetDir), 'utf8'))
    return stamp.profile === speechRuntimeProfile
      && stamp.requirementsHash === await speechRequirementsHash()
  } catch {
    return false
  }
}

async function writeRuntimeStamp(targetDir, pythonPath) {
  const pythonVersion = existsSync(pythonPath)
    ? runOutput(pythonPath, ['-c', 'import sys; print(".".join(map(str, sys.version_info[:3])))'])
    : null

  await writeFile(
    runtimeStampPath(targetDir),
    `${JSON.stringify({
      profile: speechRuntimeProfile,
      requirementsHash: await speechRequirementsHash(),
      pythonVersion,
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
  )
}

function downloadFile(url, destination, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (
        response.statusCode
        && response.statusCode >= 300
        && response.statusCode < 400
        && response.headers.location
      ) {
        response.resume()
        if (redirectCount > 5) {
          reject(new Error(`[Eqoustics] Too many redirects while downloading ${url}`))
          return
        }
        downloadFile(new URL(response.headers.location, url).toString(), destination, redirectCount + 1)
          .then(resolve)
          .catch(reject)
        return
      }

      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`[Eqoustics] Download failed (${response.statusCode}) for ${url}`))
        return
      }

      const file = createWriteStream(destination)
      response.pipe(file)
      file.on('finish', () => {
        file.close(resolve)
      })
      file.on('error', reject)
    }).on('error', reject)
  })
}

function pythonBaseCommand() {
  if (process.env.EQOUSTICS_BASE_PYTHON && commandWorks(process.env.EQOUSTICS_BASE_PYTHON)) {
    return { command: process.env.EQOUSTICS_BASE_PYTHON, args: [] }
  }

  if (isWindows && commandWorks('py', ['-3', '--version'])) {
    return { command: 'py', args: ['-3'] }
  }

  if (commandWorks('python3')) {
    return { command: 'python3', args: [] }
  }

  if (commandWorks('python')) {
    return { command: 'python', args: [] }
  }

  throw new Error('[Eqoustics] Python 3 was not found. Install Python 3, then retry.')
}

function speechDependencyCheckScript() {
  return `
import importlib.util
import sys
sys.exit(0 if importlib.util.find_spec("litert_lm") is not None else 1)
`
}

function pythonHasSpeechDependencies(pythonPath) {
  if (!existsSync(pythonPath)) return false

  return Boolean(run(pythonPath, ['-B', '-c', speechDependencyCheckScript()], { optional: true, quiet: true }))
}

async function pythonRuntimeReady(targetDir, pythonPath) {
  return pythonHasSpeechDependencies(pythonPath) && await runtimeStampMatches(targetDir)
}

async function withHeartbeat(label, task) {
  const startedAt = Date.now()
  const heartbeat = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
    console.log(`[Eqoustics] ${label}... elapsed ${elapsedSeconds}s.`)
  }, 30_000)

  try {
    return await task()
  } finally {
    clearInterval(heartbeat)
  }
}

async function prunePythonCacheFiles(root) {
  if (!existsSync(root)) return

  let removedCount = 0
  async function walk(directory) {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__pycache__') {
          await rm(entryPath, { recursive: true, force: true })
          removedCount += 1
        } else {
          await walk(entryPath)
        }
      } else if (entry.isFile() && /\.(?:pyc|pyo)$/i.test(entry.name)) {
        await rm(entryPath, { force: true })
        removedCount += 1
      }
    }
  }

  await withHeartbeat('Still pruning Python bytecode caches from the portable runtime', () => walk(root))
  if (removedCount > 0) {
    console.log(`[Eqoustics] Removed ${removedCount} Python bytecode cache entries from the portable runtime.`)
  }
}

async function configurePortablePythonPath() {
  const entries = await readdir(portablePythonDir)
  const pathFile = entries.find((entry) => /^python\d+\._pth$/i.test(entry))
  if (!pathFile) {
    throw new Error('[Eqoustics] Portable Python path configuration file was not found.')
  }

  await writeFile(
    path.join(portablePythonDir, pathFile),
    [
      pathFile.replace('._pth', '.zip'),
      '.',
      'Lib',
      'Lib\\site-packages',
      'import site',
      '',
    ].join('\n'),
  )
}

function installSpeechDependencies(pythonPath) {
  console.log('[Eqoustics] Updating Python packaging tools...')
  run(pythonPath, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'])

  if (existsSync(requirementsPath)) {
    console.log('[Eqoustics] Installing LiteRT speech dependency...')
    run(pythonPath, ['-m', 'pip', 'install', '-r', requirementsPath])
  }
}

function ensureVirtualEnvironment(targetDir, targetPython, basePython) {
  if (existsSync(targetPython)) return

  console.log(`[Eqoustics] Creating Python virtual environment at ${targetDir}`)
  run(basePython.command, [...basePython.args, '-m', 'venv', targetDir])
}

async function prepareWindowsPortablePython(sourceVenvDir, sourcePython) {
  if (!isWindows) return

  const pythonVersion = runOutput(sourcePython, [
    '-c',
    'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")',
  ])
  const embedZipName = `python-${pythonVersion}-embed-amd64.zip`
  const embedZipPath = path.join(cacheDir, embedZipName)
  const embedUrl = `https://www.python.org/ftp/python/${pythonVersion}/${embedZipName}`

  await mkdir(cacheDir, { recursive: true })
  if (!existsSync(embedZipPath)) {
    console.log(`[Eqoustics] Downloading portable Python runtime ${pythonVersion}...`)
    await downloadFile(embedUrl, embedZipPath)
  }

  console.log(`[Eqoustics] Preparing self-contained portable Python runtime at ${portablePythonDir}`)
  await rm(portablePythonDir, { recursive: true, force: true })
  await mkdir(portablePythonDir, { recursive: true })
  run('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Expand-Archive -LiteralPath '${embedZipPath.replaceAll("'", "''")}' -DestinationPath '${portablePythonDir.replaceAll("'", "''")}' -Force`,
  ])

  await mkdir(path.join(portablePythonDir, 'Lib'), { recursive: true })
  console.log('[Eqoustics] Copying Python packages into the portable runtime...')
  await withHeartbeat('Still copying Python packages into the portable runtime', () => cp(
    path.join(sourceVenvDir, 'Lib', 'site-packages'),
    path.join(portablePythonDir, 'Lib', 'site-packages'),
    { recursive: true, force: true },
  ))
  await prunePythonCacheFiles(path.join(portablePythonDir, 'Lib', 'site-packages'))
  await configurePortablePythonPath()

  console.log('[Eqoustics] Verifying self-contained portable Python runtime...')
  run(portablePython, [
    '-B',
    '-c',
    'import litert_lm; print("litert_lm ready")',
  ])
  await writeRuntimeStamp(portablePythonDir, portablePython)
}

async function main() {
  await mkdir(path.dirname(venvDir), { recursive: true })

  const basePython = pythonBaseCommand()

  if (skipPortable) {
    if (!forcePrepare && await pythonRuntimeReady(venvDir, venvPython)) {
      console.log('[Eqoustics] Local LiteRT Python virtual environment is ready for development.')
      return
    }

    if (forcePrepare || !await runtimeStampMatches(venvDir)) {
      console.log('[Eqoustics] Resetting local Python virtual environment for the LiteRT speech runtime.')
      await rm(venvDir, { recursive: true, force: true })
    }

    ensureVirtualEnvironment(venvDir, venvPython, basePython)

    installSpeechDependencies(venvPython)
    await writeRuntimeStamp(venvDir, venvPython)
    console.log('[Eqoustics] Skipping portable Python runtime preparation for development mode.')
    return
  }

  const packageReady = await pythonRuntimeReady(packageVenvDir, packageVenvPython)
  const portableReady = !isWindows || await pythonRuntimeReady(portablePythonDir, portablePython)

  if (!forcePrepare && packageReady && portableReady) {
    if (isWindows) {
      await prunePythonCacheFiles(path.join(portablePythonDir, 'Lib', 'site-packages'))
    }
    console.log('[Eqoustics] LiteRT package and portable Python runtimes are ready for packaging.')
    return
  }

  if (forcePrepare || !await runtimeStampMatches(packageVenvDir)) {
    console.log('[Eqoustics] Resetting package Python virtual environment for the LiteRT speech runtime.')
    await rm(packageVenvDir, { recursive: true, force: true })
    await rm(portablePythonDir, { recursive: true, force: true })
  } else if (isWindows && !await runtimeStampMatches(portablePythonDir)) {
    console.log('[Eqoustics] Resetting portable Python runtime for the LiteRT speech runtime.')
    await rm(portablePythonDir, { recursive: true, force: true })
  }

  ensureVirtualEnvironment(packageVenvDir, packageVenvPython, basePython)

  if (forcePrepare || !pythonHasSpeechDependencies(packageVenvPython) || !await runtimeStampMatches(packageVenvDir)) {
    installSpeechDependencies(packageVenvPython)
    await writeRuntimeStamp(packageVenvDir, packageVenvPython)
  } else {
    console.log('[Eqoustics] Package Python virtual environment already has LiteRT speech dependency.')
  }

  if (!isWindows) {
    return
  }

  if (!forcePrepare && await pythonRuntimeReady(portablePythonDir, portablePython)) {
    await prunePythonCacheFiles(path.join(portablePythonDir, 'Lib', 'site-packages'))
    console.log('[Eqoustics] Portable Python runtime already has LiteRT speech dependencies.')
  } else {
    await prepareWindowsPortablePython(packageVenvDir, packageVenvPython)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
