const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PLATFORMS = [
  { target: 'node18-win-x64', ext: '.exe', os: 'win' },
  { target: 'node18-linux-x64', ext: '', os: 'linux' },
  { target: 'node18-macos-x64', ext: '', os: 'macos' }
];

const VERSION = require('../package.json').version;
const ROOT_DIR = path.join(__dirname, '..');

function log(message) {
  console.log(`[build-release] ${message}`);
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

function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  ensureDir(destDir);
  fs.copyFileSync(src, dest);
  log(`Copied: ${src} -> ${dest}`);
}

function buildTypeScript() {
  log('Building TypeScript...');
  runCommand('npm run build', { cwd: ROOT_DIR });
}

function buildForPlatform(platform) {
  log(`\nBuilding for ${platform.target}...`);
  
  const outputName = `deerflow-launcher${platform.ext}`;
  const releaseDir = path.join(ROOT_DIR, 'dist', 'release', `${platform.os}-x64`);
  const outputPath = path.join(releaseDir, outputName);
  
  ensureDir(releaseDir);
  
  runCommand(
    `npx pkg . --targets ${platform.target} --output "${outputPath}"`,
    { cwd: ROOT_DIR }
  );
  
  const assetsDir = path.join(releaseDir, 'assets');
  ensureDir(assetsDir);
  
  const wrapperSrc = path.join(ROOT_DIR, 'scripts', 'wrapper.js');
  const wrapperDest = path.join(assetsDir, 'wrapper.js');
  copyFile(wrapperSrc, wrapperDest);
  
  log(`✓ Built ${outputPath}`);
  
  return { releaseDir, outputPath };
}

function createReadme(releaseDir, platform) {
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

For more information, visit:
https://github.com/deerflow/deer-flow
https://github.com/Skyline10124/deerflow-launcher

Requirements:
  - Python 3.12+
  - Node.js 22+
  - uv (Python package manager)
  - pnpm (Node.js package manager)
  - nginx

License: MIT
`;
  
  const readmePath = path.join(releaseDir, 'README.txt');
  fs.writeFileSync(readmePath, readmeContent);
  log(`Created: ${readmePath}`);
}

function createReleasePackage(releaseDir, platform) {
  const archiver = require('archiver');
  const outputExt = platform.os === 'win' ? 'zip' : 'tar.gz';
  const archivePath = path.join(
    ROOT_DIR, 
    'dist', 
    'release', 
    `deerflow-launcher-v${VERSION}-${platform.os}-x64.${outputExt}`
  );
  
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath);
    const archive = archiver(outputExt === 'zip' ? 'zip' : 'tar', {
      gzip: outputExt === 'tar.gz',
      gzipOptions: { level: 9 }
    });
    
    output.on('close', () => {
      log(`Created archive: ${archivePath} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
      resolve(archivePath);
    });
    
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(releaseDir, false);
    archive.finalize();
  });
}

async function main() {
  log(`DeerFlow Launcher Build Script v${VERSION}`);
  log('========================================\n');
  
  buildTypeScript();
  
  for (const platform of PLATFORMS) {
    const { releaseDir } = buildForPlatform(platform);
    createReadme(releaseDir, platform);
    await createReleasePackage(releaseDir, platform);
  }
  
  log('\n✓ Build complete!');
  log(`Output directory: ${path.join(ROOT_DIR, 'dist', 'release')}`);
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
