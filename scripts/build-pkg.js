import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import archiver from 'archiver'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const VERSION = JSON.parse(fs.readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')).version
const ROOT_DIR = join(__dirname, '..')
const DIST_DIR = join(ROOT_DIR, 'dist')
const PKG_DIR = join(DIST_DIR, 'pkg')
const RELEASE_DIR = join(DIST_DIR, 'release')

const ALL_PLATFORMS = [
  { ext: '.exe', os: 'win', target: 'node22-win-x64', arch: 'x64' },
  { ext: '', os: 'linux', target: 'node22-linux-x64', arch: 'x64' },
  { ext: '', os: 'macos', target: 'node22-macos-x64', arch: 'x64' }
]

function log(message) {
  console.log(`[pkg-build] ${message}`)
}

function runCommand(command, options = {}) {
  log(`Running: ${command}`)
  execSync(command, { stdio: 'inherit', ...options })
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function getBuildTime() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  return `${year}${month}${day}_${hour}${minute}`
}

function buildTypeScript() {
  log('Building TypeScript...')
  runCommand('npm run build', { cwd: ROOT_DIR })
}

function buildPkgForPlatform(platform) {
  log(`\nBuilding pkg for ${platform.os}-${platform.arch}...`)
  
  ensureDir(PKG_DIR)
  
  const outputPath = join(PKG_DIR, `deerflow-launcher-${platform.os}${platform.ext}`)
  
  runCommand(
    `npx @yao-pkg/pkg . --targets ${platform.target} --output "${outputPath}" --public-packages "*" --public`,
    { cwd: ROOT_DIR }
  )
  
  log(`✓ Built pkg: ${outputPath}`)
  
  return outputPath
}

function createReleaseDir(pkgPath, platform) {
  const releaseDir = join(RELEASE_DIR, `deerflow-launcher_${VERSION}_${platform.os}-${platform.arch}`)
  ensureDir(releaseDir)
  
  const outputName = `deerflow-launcher${platform.ext}`
  const finalPath = join(releaseDir, outputName)
  fs.copyFileSync(pkgPath, finalPath)
  
  const assetsDir = join(releaseDir, 'assets')
  ensureDir(assetsDir)
  
  const wrapperSrc = join(ROOT_DIR, 'scripts', 'wrapper.js')
  const wrapperDest = join(assetsDir, 'wrapper.js')
  fs.copyFileSync(wrapperSrc, wrapperDest)
  
  const readmeContent = `DeerFlow Launcher v${VERSION}
========================

This is the DeerFlow Launcher for ${platform.os}.

Usage:
  ./deerflow-launcher${platform.ext} --help

Commands:
  deerflow-launcher start [services...]    Start services
  deerflow-launcher stop [services...]     Stop services
  deerflow-launcher status [service]       Show service status
  deerflow-launcher logs [service]         View service logs
  deerflow-launcher doctor                 Run environment diagnostics
  deerflow-launcher config <command>       Manage configuration

Requirements:
  - Python 3.12+
  - Node.js 22+
  - uv (Python package manager)
  - pnpm (Node.js package manager)
  - nginx

License: MIT
`
  
  fs.writeFileSync(join(releaseDir, 'README.txt'), readmeContent)
  
  log(`✓ Release directory created: ${releaseDir}`)
  
  return releaseDir
}

function createArchive(releaseDir, platform, buildTime) {
  return new Promise((resolve, reject) => {
    const archiveExt = platform.os === 'win' ? 'zip' : 'tar.gz'
    const archiveName = `deerflow-launcher_${VERSION}_${platform.os}-${platform.arch}_${buildTime}.${archiveExt}`
    const archivePath = join(RELEASE_DIR, archiveName)
    
    const output = fs.createWriteStream(archivePath)
    const archive = archiver(archiveExt === 'zip' ? 'zip' : 'tar', {
      gzip: archiveExt === 'tar.gz',
      gzipOptions: { level: 9 }
    })
    
    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2)
      log(`✓ Created archive: ${archiveName} (${sizeMB} MB)`)
      resolve(archivePath)
    })
    
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(releaseDir, path.basename(releaseDir))
    archive.finalize()
  })
}

function getPlatforms() {
  const platformArg = process.argv[2]
  
  if (!platformArg) {
    return ALL_PLATFORMS
  }
  
  const platformMap = {
    'win': ALL_PLATFORMS.find(p => p.os === 'win'),
    'linux': ALL_PLATFORMS.find(p => p.os === 'linux'),
    'macos': ALL_PLATFORMS.find(p => p.os === 'macos'),
    'mac': ALL_PLATFORMS.find(p => p.os === 'macos'),
  }
  
  const platform = platformMap[platformArg.toLowerCase()]
  
  if (!platform) {
    log(`Unknown platform: ${platformArg}`)
    log(`Available platforms: win, linux, macos`)
    process.exit(1)
  }
  
  return [platform]
}

async function main() {
  const buildTime = getBuildTime()
  const platforms = getPlatforms()
  
  log(`DeerFlow Launcher Pkg Build v${VERSION}`)
  log(`Build time: ${buildTime}`)
  log(`Platforms: ${platforms.map(p => p.os).join(', ')}`)
  log('========================================\n')
  
  buildTypeScript()
  
  ensureDir(RELEASE_DIR)
  
  const archives = []
  const failed = []
  
  for (const platform of platforms) {
    try {
      const pkgPath = buildPkgForPlatform(platform)
      const releaseDir = createReleaseDir(pkgPath, platform)
      const archivePath = await createArchive(releaseDir, platform, buildTime)
      archives.push(archivePath)
    } catch (err) {
      log(`✗ Failed to build for ${platform.os}: ${err.message}`)
      failed.push(platform.os)
    }
  }
  
  log('\n========================================')
  log('✓ Build complete!')
  log(`Output directory: ${RELEASE_DIR}`)
  
  if (archives.length > 0) {
    log('\nArchives:')
    archives.forEach(a => log(`  - ${path.basename(a)}`))
  }
  
  if (failed.length > 0) {
    log(`\n⚠ Failed platforms: ${failed.join(', ')}`)
    log('Note: Cross-platform builds may require running on the target OS.')
  }
}

main().catch(err => {
  console.error('Build failed:', err)
  process.exit(1)
})
