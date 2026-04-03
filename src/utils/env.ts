import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../modules/Logger.js';
import { getDefaultPath, getPath } from '../modules/LauncherConfig.js';

const logger = getLogger('Env');

let cachedDeerFlowPath: string | null = null;
let cachedEnvVars: Record<string, string> | null = null;

function parseDotEnvFile(envFilePath: string): Record<string, string> {
  if (!fs.existsSync(envFilePath)) {
    return {};
  }

  const result: Record<string, string> = {};

  try {
    const content = fs.readFileSync(envFilePath, 'utf-8');
    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line || line.startsWith('#')) {
        continue;
      }

      const stripped = line.startsWith('export ') ? line.slice(7).trim() : line;

      const eqIndex = stripped.indexOf('=');
      if (eqIndex === -1) {
        continue;
      }

      const key = stripped.slice(0, eqIndex).trim();
      let value = stripped.slice(eqIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      const commentIndex = value.indexOf(' #');
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }

      if (key) {
        result[key] = value;
      }
    }

    const keyCount = Object.keys(result).length;
    if (keyCount > 0) {
      logger.debug(`Loaded ${keyCount} variable(s) from .env`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to read .env file: ${msg}`);
  }

  return result;
}

function findDeerFlowPath(): string {
  let currentPath = process.cwd();
  
  while (currentPath !== path.dirname(currentPath)) {
    const hasConfig = fs.existsSync(path.join(currentPath, 'config.example.yaml'));
    const hasBackend = fs.existsSync(path.join(currentPath, 'backend'));
    const hasFrontend = fs.existsSync(path.join(currentPath, 'frontend'));
    
    if (hasConfig || (hasBackend && hasFrontend)) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }

  const hasRootConfig = fs.existsSync(path.join(currentPath, 'config.example.yaml'));
  if (hasRootConfig) {
    return currentPath;
  }

  throw new Error(
    'Could not find DeerFlow project root.\n\n' +
    'Please either:\n' +
    '  1. Use --deerflow-path option\n' +
    '  2. Set a default path with: deerflow config path add <name> <path>\n' +
    '  3. Set DEERFLOW_PATH environment variable\n' +
    '  4. Run this launcher from the DeerFlow directory'
  );
}

function validatePath(deerflowPath: string): boolean {
  if (!fs.existsSync(deerflowPath)) {
    return false;
  }
  const hasConfig = fs.existsSync(path.join(deerflowPath, 'config.example.yaml'));
  const hasBackend = fs.existsSync(path.join(deerflowPath, 'backend'));
  const hasFrontend = fs.existsSync(path.join(deerflowPath, 'frontend'));
  return hasConfig || (hasBackend && hasFrontend);
}

export interface GetDeerFlowPathOptions {
  cliPath?: string;
  usePath?: string;
}

export function getDeerFlowPath(options?: GetDeerFlowPathOptions): string {
  if (cachedDeerFlowPath) {
    return cachedDeerFlowPath;
  }

  let deerflowPath: string | undefined;

  if (options?.cliPath) {
    if (validatePath(options.cliPath)) {
      deerflowPath = options.cliPath;
      logger.debug(`Using CLI path: ${deerflowPath}`);
    } else {
      logger.warn(`CLI path invalid: ${options.cliPath}`);
    }
  }

  if (!deerflowPath && options?.usePath) {
    const namedPath = getPath(options.usePath);
    if (namedPath && validatePath(namedPath.path)) {
      deerflowPath = namedPath.path;
      logger.debug(`Using named path "${namedPath.name}": ${deerflowPath}`);
    } else if (namedPath) {
      logger.warn(`Named path "${options.usePath}" is invalid: ${namedPath.path}`);
    } else {
      logger.warn(`Named path "${options.usePath}" not found in config`);
    }
  }

  if (!deerflowPath) {
    const configPath = getDefaultPath();
    if (configPath && validatePath(configPath.path)) {
      deerflowPath = configPath.path;
      logger.debug(`Using default config path "${configPath.name}": ${deerflowPath}`);
    }
  }

  if (!deerflowPath) {
    const envPath = process.env.DEERFLOW_PATH;
    if (envPath) {
      if (fs.existsSync(envPath)) {
        deerflowPath = envPath;
        logger.debug(`Using DEERFLOW_PATH: ${deerflowPath}`);
      } else {
        logger.warn(`DEERFLOW_PATH points to non-existent path: ${envPath}`);
      }
    }
  }

  if (!deerflowPath) {
    deerflowPath = findDeerFlowPath();
    logger.debug(`Using auto-detected path: ${deerflowPath}`);
  }

  cachedDeerFlowPath = deerflowPath;
  
  if (!cachedEnvVars) {
    const envFile = path.join(cachedDeerFlowPath, '.env');
    cachedEnvVars = parseDotEnvFile(envFile);
  }

  return cachedDeerFlowPath;
}

export function loadDotEnv(deerflowPath?: string): Record<string, string> {
  if (cachedEnvVars) {
    return cachedEnvVars;
  }

  const basePath = deerflowPath || getDeerFlowPath();
  const envFile = path.join(basePath, '.env');
  cachedEnvVars = parseDotEnvFile(envFile);
  
  return cachedEnvVars;
}

export function getEnvVar(key: string, defaultValue?: string): string | undefined {
  const envVars = loadDotEnv();
  return envVars[key] ?? defaultValue;
}

export function clearCache(): void {
  cachedDeerFlowPath = null;
  cachedEnvVars = null;
}
