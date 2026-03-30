import * as path from 'path';
import * as fs from 'fs';
import { Launcher, LauncherOptions } from './core/Launcher';
import { LogLevel, parseLogLevel } from './modules/Logger';

const DEBUG_MODE = process.env.DEBUG_LAUNCHER === 'true';

function getDeerFlowPath(): string {
  const envPath = process.env.DEERFLOW_PATH;
  if (envPath) {
    if (!fs.existsSync(envPath)) {
      console.error(`Error: DEERFLOW_PATH environment variable points to non-existent path: ${envPath}`);
      process.exit(1);
    }
    return envPath;
  }

  let currentPath = process.cwd();
  
  while (currentPath !== path.dirname(currentPath)) {
    const configYaml = path.join(currentPath, 'config.example.yaml');
    if (fs.existsSync(configYaml)) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }

  const rootConfigYaml = path.join(currentPath, 'config.example.yaml');
  if (fs.existsSync(rootConfigYaml)) {
    return currentPath;
  }

  console.error('Error: Could not find DeerFlow project.');
  console.error('');
  console.error('Please either:');
  console.error('  1. Set DEERFLOW_PATH environment variable to the DeerFlow directory');
  console.error('  2. Run this launcher from the DeerFlow directory');
  console.error('  3. Run this launcher from a subdirectory of DeerFlow');
  console.error('');
  console.error('Example:');
  console.error('  export DEERFLOW_PATH=/path/to/deer-flow');
  console.error('  npm start');
  process.exit(1);
}

function getLogLevel(): LogLevel {
  if (DEBUG_MODE) {
    return LogLevel.DEBUG;
  }
  return parseLogLevel(process.env.LOG_LEVEL);
}

async function main(): Promise<void> {
  const deerflowPath = getDeerFlowPath();
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

  const handleShutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    try {
      await launcher.stop();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
    process.exit(0);
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
      
      await new Promise<void>((resolve) => {
        process.on('beforeExit', () => resolve());
      });
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
