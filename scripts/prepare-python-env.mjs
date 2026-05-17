import { createWriteStream, existsSync } from 'node:fs'
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import https from 'node:https'

const rootDir = process.cwd()
const venvDir = path.join(rootDir, '.eqoustics-python')
const portablePythonDir = path.join(rootDir, '.eqoustics-python-portable')
const cacheDir = path.join(rootDir, '.eqoustics-python-cache')
const requirementsPath = path.join(rootDir, 'electron', 'python', 'requirements-speech.txt')
const isWindows = process.platform === 'win32'
const venvPython = isWindows
  ? path.join(venvDir, 'Scripts', 'python.exe')
  : path.join(venvDir, 'bin', 'python')
const portablePython = path.join(portablePythonDir, 'python.exe')
const torchIndexUrl = process.env.EQOUSTICS_TORCH_INDEX_URL || 'https://download.pytorch.org/whl/cu128'
const skipPortable = process.argv.includes('--skip-portable')

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

function localVenvHasSpeechDependencies() {
  if (!existsSync(venvPython)) return false

  const pythonIsWindows = isWindows ? 'True' : 'False'
  const dependencyCheck = `
import importlib.util
import sys
missing = [
    package for package in ("torch", "torchvision", "transformers", "accelerate", "PIL", "librosa", "litert_lm")
    if importlib.util.find_spec(package) is None
]
if missing:
    sys.exit(1)
import torch
if ${pythonIsWindows} and torch.version.cuda is None:
    sys.exit(1)
sys.exit(0)
`
  return Boolean(run(venvPython, ['-c', dependencyCheck], { optional: true, quiet: true }))
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

async function prepareWindowsPortablePython() {
  if (!isWindows) return

  const pythonVersion = runOutput(venvPython, [
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
  await cp(
    path.join(venvDir, 'Lib', 'site-packages'),
    path.join(portablePythonDir, 'Lib', 'site-packages'),
    { recursive: true, force: true },
  )
  await configurePortablePythonPath()

  console.log('[Eqoustics] Verifying self-contained portable Python runtime...')
  run(portablePython, [
    '-c',
    'import torch, torchvision, transformers, accelerate, librosa, PIL, litert_lm; print(torch.__version__); print(torch.cuda.is_available())',
  ])
}

async function main() {
  await mkdir(path.dirname(venvDir), { recursive: true })

  if (skipPortable && localVenvHasSpeechDependencies()) {
    console.log('[Eqoustics] Local Python virtual environment is ready for development.')
    return
  }

  const basePython = pythonBaseCommand()

  if (!existsSync(venvPython)) {
    console.log(`[Eqoustics] Creating local Python virtual environment at ${venvDir}`)
    run(basePython.command, [...basePython.args, '-m', 'venv', venvDir])
  }

  console.log('[Eqoustics] Updating local Python packaging tools...')
  run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'])

  if (isWindows) {
    console.log(`[Eqoustics] Installing CUDA-enabled PyTorch into the local virtual environment from ${torchIndexUrl}`)
    run(venvPython, [
      '-m',
      'pip',
      'install',
      '--upgrade',
      'torch',
      'torchvision',
      '--index-url',
      torchIndexUrl,
    ])
  }

  if (existsSync(requirementsPath)) {
    console.log('[Eqoustics] Installing Python speech dependencies into the local virtual environment...')
    run(venvPython, ['-m', 'pip', 'install', '-r', requirementsPath])
  }

  if (skipPortable) {
    console.log('[Eqoustics] Skipping portable Python runtime preparation for development mode.')
  } else {
    await prepareWindowsPortablePython()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
