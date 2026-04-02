import fs from 'fs';
import path from 'path';
import { $ } from 'bun';
import archiver from 'archiver';

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

function warn(message: string) {
  console.warn(`[build-release] WARNING: ${message}`);
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

function getCurrentPlatform(): typeof PLATFORMS[0] | undefined {
  const platform = process.platform;
  const arch = process.arch;
  
  if (platform === 'win32' && arch === 'x64') {
    return PLATFORMS[0];
  } else if (platform === 'linux' && arch === 'x64') {
    return PLATFORMS[1];
  } else if (platform === 'darwin' && arch === 'x64') {
    return PLATFORMS[2];
  }
  return undefined;
}

async function buildForPlatform(platform: typeof PLATFORMS[0]): Promise<{ releaseDir: string; outputPath: string } | null> {
  log(`\nBuilding for ${platform.target}...`);
  
  const outputName = `deerflow-launcher${platform.ext}`;
  const releaseDir = path.join(ROOT_DIR, 'dist', 'release', `${platform.os}-x64`);
  const outputPath = path.join(releaseDir, outputName);
  
  ensureDir(releaseDir);
  
  try {
    const result = Bun.spawnSync([
      'bun', 'build', '--compile',
      `--target=${platform.target}`,
      './src/cli.ts',
      '--outfile', outputPath
    ], {
      cwd: ROOT_DIR,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    if (result.exitCode !== 0) {
      const stderr = result.stderr?.toString() || '';
      if (stderr.includes('download may be incomplete') || stderr.includes('Failed to extract')) {
        warn(`Cross-compilation for ${platform.target} failed (Bun runtime download issue).`);
        warn(`To build for this platform, run the build script on that platform directly.`);
        return null;
      }
      throw new Error(`Build failed with exit code ${result.exitCode}: ${stderr}`);
    }
    
    log(`✓ Built ${outputPath}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    warn(`Failed to build for ${platform.target}: ${errorMsg}`);
    return null;
  }
  
  const assetsDir = path.join(releaseDir, 'assets');
  ensureDir(assetsDir);
  
  const wrapperSrc = path.join(ROOT_DIR, 'scripts', 'wrapper.js');
  if (fs.existsSync(wrapperSrc)) {
    const wrapperDest = path.join(assetsDir, 'wrapper.js');
    copyFile(wrapperSrc, wrapperDest);
  }
  
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
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(archivePath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));
      
      archive.pipe(output);
      archive.directory(releaseDir, false);
      archive.finalize();
    });
  } else {
    await $`tar -czf ${archivePath} -C ${releaseDir} .`;
  }
  
  const stats = fs.statSync(archivePath);
  log(`Created archive: ${archivePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  
  return archivePath;
}

async function main() {
  const args = process.argv.slice(2);
  const currentOnly = args.includes('--current') || args.includes('-c');
  const platformArg = args.find(a => !a.startsWith('-'));
  
  log(`DeerFlow Launcher Build Script v${VERSION} (Bun)`);
  log('===============================================\n');
  
  let platformsToBuild: typeof PLATFORMS;
  
  if (currentOnly) {
    const current = getCurrentPlatform();
    if (!current) {
      console.error('Cannot determine current platform for building.');
      process.exit(1);
    }
    platformsToBuild = [current];
    log(`Building for current platform only: ${current.target}`);
  } else if (platformArg) {
    const found = PLATFORMS.find(p => p.os === platformArg || p.target === platformArg);
    if (!found) {
      console.error(`Unknown platform: ${platformArg}. Available: ${PLATFORMS.map(p => p.os).join(', ')}`);
      process.exit(1);
    }
    platformsToBuild = [found];
    log(`Building for specified platform: ${found.target}`);
  } else {
    platformsToBuild = PLATFORMS;
    log('Building for all platforms...');
  }
  
  const results: { platform: string; success: boolean; archive?: string }[] = [];
  
  for (const platform of platformsToBuild) {
    const buildResult = await buildForPlatform(platform);
    
    if (buildResult) {
      createReadme(buildResult.releaseDir, platform);
      const archivePath = await createReleasePackage(buildResult.releaseDir, platform);
      results.push({ platform: platform.os, success: true, archive: archivePath });
    } else {
      results.push({ platform: platform.os, success: false });
    }
  }
  
  log('\n===============================================');
  log('Build Summary:');
  for (const result of results) {
    if (result.success) {
      log(`  ✓ ${result.platform}: ${result.archive}`);
    } else {
      log(`  ✗ ${result.platform}: Failed (skipped)`);
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  if (successCount === 0) {
    console.error('\nAll builds failed!');
    process.exit(1);
  }
  
  log(`\n✓ ${successCount}/${results.length} platform(s) built successfully.`);
  log(`Output directory: ${path.join(ROOT_DIR, 'dist', 'release')}`);
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
