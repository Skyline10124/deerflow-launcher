import fs from 'fs';
import path from 'path';
import { $ } from 'bun';

const PLATFORMS = [
  { target: 'bun-windows-x64', ext: '.exe', os: 'win' },
  { target: 'bun-linux-x64', ext: '', os: 'linux' },
  { target: 'bun-darwin-x64', ext: '', os: 'macos' }
];

const VERSION = '0.5.0';
const ROOT_DIR = import.meta.dir.replace(/[/\\]scripts$/, '');

function log(message: string) {
  console.log(`[build-release] ${message}`);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src: string, dest: string) {
  const destDir = path.dirname(dest);
  ensureDir(destDir);
  fs.copyFileSync(src, dest);
  log(`Copied: ${src} -> ${dest}`);
}

async function buildForPlatform(platform: typeof PLATFORMS[0]) {
  log(`\nBuilding for ${platform.target}...`);
  
  const outputName = `deerflow-launcher${platform.ext}`;
  const releaseDir = path.join(ROOT_DIR, 'dist', 'release', `${platform.os}-x64`);
  const outputPath = path.join(releaseDir, outputName);
  
  ensureDir(releaseDir);
  
  await $`bun build --compile --target=${platform.target} ./src/cli.ts --outfile ${outputPath}`.cwd(ROOT_DIR);
  
  const assetsDir = path.join(releaseDir, 'assets');
  ensureDir(assetsDir);
  
  const wrapperSrc = path.join(ROOT_DIR, 'scripts', 'wrapper.js');
  if (fs.existsSync(wrapperSrc)) {
    const wrapperDest = path.join(assetsDir, 'wrapper.js');
    copyFile(wrapperSrc, wrapperDest);
  }
  
  log(`✓ Built ${outputPath}`);
  
  return { releaseDir, outputPath };
}

function createReadme(releaseDir: string, platform: typeof PLATFORMS[0]) {
  const readmeContent = `DeerFlow Launcher v${VERSION} (Bun-powered)
========================================

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
  - Bun 1.0+ (bundled, no external runtime needed)
  - uv (Python package manager)
  - pnpm (Node.js package manager)
  - nginx

License: MIT
`;
  
  const readmePath = path.join(releaseDir, 'README.txt');
  fs.writeFileSync(readmePath, readmeContent);
  log(`Created: ${readmePath}`);
}

async function createReleasePackage(releaseDir: string, platform: typeof PLATFORMS[0]) {
  const outputExt = platform.os === 'win' ? 'zip' : 'tar.gz';
  const archivePath = path.join(
    ROOT_DIR, 
    'dist', 
    'release', 
    `deerflow-launcher-v${VERSION}-${platform.os}-x64.${outputExt}`
  );
  
  ensureDir(path.dirname(archivePath));
  
  if (platform.os === 'win') {
    await $`powershell Compress-Archive -Path ${releaseDir}/* -DestinationPath ${archivePath} -Force`;
  } else {
    await $`tar -czf ${archivePath} -C ${releaseDir} .`;
  }
  
  const stats = fs.statSync(archivePath);
  log(`Created archive: ${archivePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  
  return archivePath;
}

async function main() {
  log(`DeerFlow Launcher Build Script v${VERSION} (Bun)`);
  log('===============================================\n');
  
  for (const platform of PLATFORMS) {
    const { releaseDir } = await buildForPlatform(platform);
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
