const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const VERSION = require('../package.json').version;
const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PKG_DIR = path.join(DIST_DIR, 'pkg');
const RELEASE_DIR = path.join(DIST_DIR, 'release');

const PLATFORMS = [
  { ext: '.exe', os: 'win', target: 'node22-win-x64', arch: 'x64' },
  { ext: '', os: 'linux', target: 'node22-linux-x64', arch: 'x64' },
  { ext: '', os: 'macos', target: 'node22-macos-x64', arch: 'x64' }
];

function log(message) {
  console.log(`[pkg-build] ${message}`);
}

function runCommand(command, options = {}) {
  log(`Running: ${command}`);
  execSync(command, { stdio: 'inherit', ...options });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getBuildTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}_${hour}${minute}`;
}

function buildTypeScript() {
  log('Building TypeScript...');
  runCommand('npm run build', { cwd: ROOT_DIR });
}

function buildPkgForPlatform(platform) {
  log(`\nBuilding pkg for ${platform.os}-${platform.arch}...`);
  
  ensureDir(PKG_DIR);
  
  const outputPath = path.join(PKG_DIR, `deerflow-launcher-${platform.os}${platform.ext}`);
  
  runCommand(
    `npx @yao-pkg/pkg . --targets ${platform.target} --output "${outputPath}"`,
    { cwd: ROOT_DIR }
  );
  
  log(`✓ Built pkg: ${outputPath}`);
  
  return outputPath;
}

function createReleaseDir(pkgPath, platform) {
  const releaseDir = path.join(RELEASE_DIR, `deerflow-launcher_${VERSION}_${platform.os}-${platform.arch}`);
  ensureDir(releaseDir);
  
  const outputName = `deerflow-launcher${platform.ext}`;
  const finalPath = path.join(releaseDir, outputName);
  fs.copyFileSync(pkgPath, finalPath);
  
  const assetsDir = path.join(releaseDir, 'assets');
  ensureDir(assetsDir);
  
  const wrapperSrc = path.join(ROOT_DIR, 'scripts', 'wrapper.js');
  const wrapperDest = path.join(assetsDir, 'wrapper.js');
  fs.copyFileSync(wrapperSrc, wrapperDest);
  
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
`;
  
  fs.writeFileSync(path.join(releaseDir, 'README.txt'), readmeContent);
  
  log(`✓ Release directory created: ${releaseDir}`);
  
  return releaseDir;
}

function createArchive(releaseDir, platform, buildTime) {
  return new Promise((resolve, reject) => {
    const archiveExt = platform.os === 'win' ? 'zip' : 'tar.gz';
    const archiveName = `deerflow-launcher_${VERSION}_${platform.os}-${platform.arch}_${buildTime}.${archiveExt}`;
    const archivePath = path.join(RELEASE_DIR, archiveName);
    
    const output = fs.createWriteStream(archivePath);
    const archive = archiver(archiveExt === 'zip' ? 'zip' : 'tar', {
      gzip: archiveExt === 'tar.gz',
      gzipOptions: { level: 9 }
    });
    
    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      log(`✓ Created archive: ${archiveName} (${sizeMB} MB)`);
      resolve(archivePath);
    });
    
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(releaseDir, path.basename(releaseDir));
    archive.finalize();
  });
}

async function main() {
  const buildTime = getBuildTime();
  
  log(`DeerFlow Launcher Pkg Build v${VERSION}`);
  log(`Build time: ${buildTime}`);
  log('========================================\n');
  
  buildTypeScript();
  
  ensureDir(RELEASE_DIR);
  
  const archives = [];
  const failed = [];
  
  for (const platform of PLATFORMS) {
    try {
      const pkgPath = buildPkgForPlatform(platform);
      const releaseDir = createReleaseDir(pkgPath, platform);
      const archivePath = await createArchive(releaseDir, platform, buildTime);
      archives.push(archivePath);
    } catch (err) {
      log(`✗ Failed to build for ${platform.os}: ${err.message}`);
      failed.push(platform.os);
    }
  }
  
  log('\n========================================');
  log('✓ Build complete!');
  log(`Output directory: ${RELEASE_DIR}`);
  
  if (archives.length > 0) {
    log('\nArchives:');
    archives.forEach(a => log(`  - ${path.basename(a)}`));
  }
  
  if (failed.length > 0) {
    log(`\n⚠ Failed platforms: ${failed.join(', ')}`);
    log('Note: Cross-platform builds may require running on the target OS.');
  }
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
