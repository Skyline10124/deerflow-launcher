import fs from 'fs'
import path from 'path'
import { spawn, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const serviceName = process.argv[2]
const command = process.argv[3]
const args = process.argv.slice(4)

function formatTimestamp() {
  return new Date().toISOString()
}

function formatLine(line) {
  const timestamp = formatTimestamp()
  return `[${timestamp}] [${serviceName}] ${line}`
}

function resolveCommand(commandName) {
  if (path.isAbsolute(commandName) || commandName.includes('\\') || commandName.includes('/')) {
    return commandName
  }

  const result = spawnSync('where.exe', [commandName], {
    encoding: 'utf-8',
    windowsHide: true
  })

  if (result.status !== 0) {
    return commandName
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || commandName
}

function resolveWindowsNodeShim(commandPath) {
  if (!fs.existsSync(commandPath)) {
    return null
  }

  try {
    const content = fs.readFileSync(commandPath, 'utf-8')
    const match =
      content.match(/"%~dp0\\([^"]+)"\s+%\*/i) ||
      content.match(/"%dp0%\\([^"]+)"\s+%\*/i)

    if (!match) {
      return null
    }

    const shimRelativePath = match[1].replace(/\\/g, path.sep)
    const shimPath = path.resolve(path.dirname(commandPath), shimRelativePath)

    return fs.existsSync(shimPath) ? shimPath : null
  } catch {
    return null
  }
}

function buildSpawnTarget(commandName, commandArgs) {
  if (process.platform !== 'win32') {
    return { command: commandName, args: commandArgs }
  }

  const resolvedCommand = resolveCommand(commandName)
  const extension = path.extname(resolvedCommand).toLowerCase()

  if (extension === '.cmd' || extension === '.bat') {
    const nodeShimScript = resolveWindowsNodeShim(resolvedCommand)
    if (nodeShimScript) {
      return {
        command: process.execPath,
        args: [nodeShimScript, ...commandArgs]
      }
    }

    const executablePath = `${resolvedCommand.slice(0, -extension.length)}.exe`
    if (fs.existsSync(executablePath)) {
      return {
        command: executablePath,
        args: commandArgs
      }
    }
  }

  return {
    command: resolvedCommand,
    args: commandArgs
  }
}

const target = buildSpawnTarget(command, args)

const proc = spawn(target.command, target.args, {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: false,
  windowsHide: true,
  env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
})

let stdoutBuffer = ''
let stderrBuffer = ''

proc.stdout.on('data', (data) => {
  stdoutBuffer += data.toString()
  const lines = stdoutBuffer.split('\n')
  stdoutBuffer = lines.pop() || ''
  lines.forEach(line => {
    if (line.trim()) {
      process.stdout.write(formatLine(line) + '\n')
    }
  })
})

proc.stderr.on('data', (data) => {
  stderrBuffer += data.toString()
  const lines = stderrBuffer.split('\n')
  stderrBuffer = lines.pop() || ''
  lines.forEach(line => {
    if (line.trim()) {
      process.stderr.write(formatLine(line) + '\n')
    }
  })
})

proc.on('exit', (code) => {
  if (stdoutBuffer.trim()) {
    process.stdout.write(formatLine(stdoutBuffer) + '\n')
  }
  if (stderrBuffer.trim()) {
    process.stderr.write(formatLine(stderrBuffer) + '\n')
  }
  process.exit(code || 0)
})

proc.on('error', (err) => {
  process.stderr.write(formatLine(`Error: ${err.message}`) + '\n')
  process.exit(1)
})

let isExiting = false

function gracefulShutdown() {
  if (isExiting) return
  isExiting = true
  
  if (process.platform === 'win32') {
    proc.kill('SIGTERM')
    setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch (e) {}
      process.exit(0)
    }, 3000)
  } else {
    proc.kill('SIGTERM')
  }
}

process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)
process.on('SIGBREAK', gracefulShutdown)
