import path from 'node:path'
import { spawn } from 'node:child_process'

const rootDir = process.cwd()
const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')
const env = { ...process.env }

delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [viteBin], {
  cwd: rootDir,
  env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
