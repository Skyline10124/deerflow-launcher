import * as fs from 'fs';
import * as path from 'path';

/**
 * 查找 DeerFlow 项目根目录
 * 按以下顺序查找:
 * 1. DEERFLOW_PATH 环境变量
 * 2. 向上递归查找包含 config.example.yaml, backend 和 frontend 文件夹的目录
 * 3. 抛出错误或返回 fallback 目录
 */
export function getDeerFlowPath(): string {
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

  // Check root one last time
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
