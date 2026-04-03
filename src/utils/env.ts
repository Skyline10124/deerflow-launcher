import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../modules/Logger.js';

const logger = getLogger('Env');

let cachedDeerFlowPath: string | null = null;
let cachedEnvVars: Record<string, string> | null = null;

/**
 * Parse a .env file and return key-value pairs.
 *
 * Supports:
 * - KEY=VALUE (unquoted)
 * - KEY="VALUE" (double-quoted, preserves inner spaces)
 * - KEY='VALUE' (single-quoted, preserves inner spaces)
 * - # comments and blank lines (skipped)
 * - Lines with export prefix: export KEY=VALUE
 *
 * Does NOT support multiline values.
 */
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

/**
 * 查找 DeerFlow 项目根目录
 * 按以下顺序查找:
 * 1. DEERFLOW_PATH 环境变量
 * 2. 向上递归查找包含 config.example.yaml, backend 和 frontend 文件夹的目录
 * 3. 抛出错误或返回 fallback 目录
 */
function findDeerFlowPath(): string {
  const envPath = process.env.DEERFLOW_PATH;
  if (envPath) {
    if (!fs.existsSync(envPath)) {
      throw new Error(`DEERFLOW_PATH environment variable points to non-existent path: ${envPath}`);
    }
    return envPath;
  }

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
    '  1. Set DEERFLOW_PATH environment variable to the DeerFlow directory\n' +
    '  2. Run this launcher from the DeerFlow directory\n' +
    '  3. Run this launcher from a subdirectory of DeerFlow'
  );
}

/**
 * 获取 DeerFlow 项目根目录
 * 
 * 首次调用时会缓存路径并加载 .env 文件
 * 后续调用直接返回缓存的路径
 */
export function getDeerFlowPath(): string {
  if (cachedDeerFlowPath) {
    return cachedDeerFlowPath;
  }

  cachedDeerFlowPath = findDeerFlowPath();
  
  if (!cachedEnvVars) {
    const envFile = path.join(cachedDeerFlowPath, '.env');
    cachedEnvVars = parseDotEnvFile(envFile);
  }

  return cachedDeerFlowPath;
}

/**
 * 加载并返回 .env 文件中的环境变量
 * 
 * @param deerflowPath - 可选的 DeerFlow 路径，如果不提供则自动查找
 */
export function loadDotEnv(deerflowPath?: string): Record<string, string> {
  if (cachedEnvVars) {
    return cachedEnvVars;
  }

  const basePath = deerflowPath || getDeerFlowPath();
  const envFile = path.join(basePath, '.env');
  cachedEnvVars = parseDotEnvFile(envFile);
  
  return cachedEnvVars;
}

/**
 * 获取 .env 中的指定变量
 */
export function getEnvVar(key: string, defaultValue?: string): string | undefined {
  const envVars = loadDotEnv();
  return envVars[key] ?? defaultValue;
}

/**
 * 清除缓存 (主要用于测试)
 */
export function clearCache(): void {
  cachedDeerFlowPath = null;
  cachedEnvVars = null;
}
