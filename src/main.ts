import * as path from 'path';
import * as fs from 'fs';
import { Launcher, LauncherOptions } from './core/Launcher';
import { LogLevel, parseLogLevel } from './modules/Logger';
import { ProcessManager } from './modules/ProcessManager';
import { getDeerFlowPath } from './utils/env';

const DEBUG_MODE = process.env.DEBUG_LAUNCHER === 'true';
const CLEAN_MODE = process.argv.includes('--clean') || process.argv.includes('-c');

async function cleanupAllProcesses(): Promise<void> {
  console.log('Cleaning up all managed processes...');
  const pm = new ProcessManager(path.join(process.cwd(), 'logs'));
  await pm.connect();
  await pm.killAllManagedProcesses();
  await pm.disconnect();
  console.log('Cleanup completed.');
}

function getLogLevel(): LogLevel {
  if (DEBUG_MODE) {
    return LogLevel.DEBUG;
  }
  return parseLogLevel(process.env.LOG_LEVEL);
}

async function main(): Promise<void> {
  if (CLEAN_MODE) {
    await cleanupAllProcesses();
    process.exit(0);
  }

  let deerflowPath: string;
  try {
    deerflowPath = getDeerFlowPath();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  
  const logDir = path.join(process.cwd(), 'logs');
  const logLevel = getLogLevel();
  
  if (DEBUG_MODE) {
    console.log('🔍 Debug mode enabled');
    console.log(`   DEERFLOW_PATH: ${deerflowPath}`);
    console.log(`   Log directory: ${logDir}`);
    console.log(`   Log level: DEBUG`);
  }

  const options: LauncherOptions = {
    deerflowPath,
    logDir,
    logLevel
  };

  const launcher = new Launcher(options);

  let shutdownResolve: () => void;
  const shutdownPromise = new Promise<void>((resolve) => {
    shutdownResolve = resolve;
  });

  const handleShutdown = (signal: string) => {
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGBREAK');
    
    console.log(`\nReceived ${signal}, shutting down...`);
    
    launcher.stop()
      .then(() => shutdownResolve())
      .catch((error) => {
        console.error('Error during shutdown:', error);
        shutdownResolve();
      });
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  
  if (process.platform === 'win32') {
    process.on('SIGBREAK', () => handleShutdown('SIGBREAK'));
  }

  try {
    const result = await launcher.start();
    
    if (result.success) {
      console.log('\nPress Ctrl+C to stop the services...');
      await shutdownPromise;
    } else {
      console.error('\nLaunch failed!');
      console.error(`Error: ${result.error}`);
      if (DEBUG_MODE && result.error) {
        console.error('\nDebug info:');
        console.error(`  Status: ${result.status}`);
        console.error(`  Duration: ${result.totalDuration}ms`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('\nUnexpected error:', error);
    if (DEBUG_MODE && error instanceof Error) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
