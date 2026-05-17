import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.join(__dirname, '..')
const buildDir = path.join(appRoot, 'build')
const sourcePngPath = path.join(buildDir, 'icon.png')
const icoPath = path.join(buildDir, 'icon.ico')
const svgPath = path.join(buildDir, 'icon.svg')
const portableSplashPath = path.join(buildDir, 'portable-splash.bmp')
const icoMaxSize = 256

function readPngSize(buffer) {
  const pngSignature = '89504e470d0a1a0a'
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error('build/icon.png is not a valid PNG file.')
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function runPowerShell(command, args) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eqoustics-icon-script-'))
  const scriptPath = path.join(tempDir, 'resize-icon.ps1')
  fs.writeFileSync(scriptPath, command)

  const options = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args]
  let result = spawnSync('powershell.exe', options, { encoding: 'utf8' })

  if (result.error?.code === 'ENOENT') {
    result = spawnSync('pwsh', options, { encoding: 'utf8' })
  }

  fs.rmSync(tempDir, { recursive: true, force: true })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'PowerShell command failed.').trim())
  }
}

function resizePngForIco(sourcePath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eqoustics-icon-'))
  const resizedPath = path.join(tempDir, 'icon-256.png')

  runPowerShell(`
    param(
      [string]$sourcePath,
      [string]$outputPath
    )

    Add-Type -AssemblyName System.Drawing
    $source = [System.Drawing.Image]::FromFile($sourcePath)
    $bitmap = New-Object System.Drawing.Bitmap ${icoMaxSize}, ${icoMaxSize}, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.DrawImage($source, 0, 0, ${icoMaxSize}, ${icoMaxSize})
      $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $graphics.Dispose()
      $bitmap.Dispose()
      $source.Dispose()
    }
  `, [sourcePath, resizedPath])

  const resizedPng = fs.readFileSync(resizedPath)
  fs.rmSync(tempDir, { recursive: true, force: true })

  return resizedPng
}

function writeIcoFromPng(buffer, { width, height }) {
  if (width !== height) {
    throw new Error(`build/icon.png must be square. Found ${width}x${height}.`)
  }

  const icoPng = width > icoMaxSize || height > icoMaxSize
    ? resizePngForIco(sourcePngPath)
    : buffer
  const icoSize = readPngSize(icoPng)

  const headerSize = 6
  const directorySize = 16
  const imageOffset = headerSize + directorySize
  const ico = Buffer.alloc(imageOffset + icoPng.length)

  ico.writeUInt16LE(0, 0)
  ico.writeUInt16LE(1, 2)
  ico.writeUInt16LE(1, 4)
  ico.writeUInt8(icoSize.width === icoMaxSize ? 0 : icoSize.width, 6)
  ico.writeUInt8(icoSize.height === icoMaxSize ? 0 : icoSize.height, 7)
  ico.writeUInt8(0, 8)
  ico.writeUInt8(0, 9)
  ico.writeUInt16LE(1, 10)
  ico.writeUInt16LE(32, 12)
  ico.writeUInt32LE(icoPng.length, 14)
  ico.writeUInt32LE(imageOffset, 18)
  icoPng.copy(ico, imageOffset)

  fs.mkdirSync(buildDir, { recursive: true })
  fs.writeFileSync(icoPath, ico)
}

function writeSvgWrapper(buffer, { width, height }) {
  const encodedPng = buffer.toString('base64')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${encodedPng}"/></svg>\n`

  fs.writeFileSync(svgPath, svg)
}

function writePortableSplash(sourcePath) {
  runPowerShell(`
    param(
      [string]$sourcePath,
      [string]$outputPath
    )

    Add-Type -AssemblyName System.Drawing
    $width = 520
    $height = 220
    $bitmap = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $icon = [System.Drawing.Image]::FromFile($sourcePath)
    $titleFont = New-Object System.Drawing.Font 'Segoe UI', 22, ([System.Drawing.FontStyle]::Bold)
    $bodyFont = New-Object System.Drawing.Font 'Segoe UI', 11, ([System.Drawing.FontStyle]::Regular)
    $titleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(28, 36, 52))
    $bodyBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(75, 86, 105))
    $backgroundBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(248, 250, 252))
    $accentBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(41, 123, 255))

    try {
      $graphics.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.FillRectangle($backgroundBrush, 0, 0, $width, $height)
      $graphics.FillRectangle($accentBrush, 0, 0, 8, $height)
      $graphics.DrawImage($icon, 42, 54, 96, 96)
      $graphics.DrawString('Starting Eqoustics', $titleFont, $titleBrush, 164, 64)
      $graphics.DrawString('Extracting the embedded Python runtime...', $bodyFont, $bodyBrush, 166, 112)
      $graphics.DrawString('This can take a minute on first launch.', $bodyFont, $bodyBrush, 166, 138)
      $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
    } finally {
      $accentBrush.Dispose()
      $backgroundBrush.Dispose()
      $bodyBrush.Dispose()
      $titleBrush.Dispose()
      $bodyFont.Dispose()
      $titleFont.Dispose()
      $icon.Dispose()
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  `, [sourcePath, portableSplashPath])
}

if (!fs.existsSync(sourcePngPath)) {
  process.exit(0)
}

const sourcePng = fs.readFileSync(sourcePngPath)
const size = readPngSize(sourcePng)

writeIcoFromPng(sourcePng, size)
writeSvgWrapper(sourcePng, size)
writePortableSplash(sourcePngPath)
