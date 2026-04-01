import { spawnSync } from 'child_process';
import { Logger, getLogger } from './Logger';
import { EnvCheckResult, DependencyInfo, ErrorCodes } from '../types';

/** 依赖项配置接口 */
interface DependencyConfig {
  name: string;
  command: string;
  versionRegex: RegExp;
  minVersion?: string;
  errorCode: string;
  versionErrorCode?: string;
}

/** 需要检查的依赖项配置列表 */
const DEPENDENCY_CONFIGS: DependencyConfig[] = [
  {
    name: 'Python',
    command: process.platform === 'win32' ? 'python --version' : 'python3 --version',
    versionRegex: /Python (\d+\.\d+\.\d+)/,
    minVersion: '3.12.0',
    errorCode: ErrorCodes.ENV_PYTHON_MISSING,
    versionErrorCode: ErrorCodes.ENV_PYTHON_VERSION
  },
  {
    name: 'Node.js',
    command: 'node --version',
    versionRegex: /v?(\d+\.\d+\.\d+)/,
    minVersion: '22.0.0',
    errorCode: ErrorCodes.ENV_NODE_MISSING,
    versionErrorCode: ErrorCodes.ENV_NODE_VERSION
  },
  {
    name: 'uv',
    command: 'uv --version',
    versionRegex: /uv\s+(\d+\.\d+\.\d+)/,
    errorCode: ErrorCodes.ENV_UV_MISSING
  },
  {
    name: 'pnpm',
    command: 'pnpm --version',
    versionRegex: /(\d+\.\d+\.\d+)/,
    errorCode: ErrorCodes.ENV_PNPM_MISSING
  },
  {
    name: 'nginx',
    command: process.platform === 'win32' ? 'nginx -v 2>&1' : 'nginx -v 2>&1',
    versionRegex: /nginx\/(\d+\.\d+\.\d+)/,
    errorCode: ErrorCodes.ENV_NGINX_MISSING
  }
];

/** 依赖项安装指南映射 */
const INSTALL_GUIDES: Record<string, string> = {
  'Python': 'Python 3.12+: Install from https://www.python.org/downloads/',
  'Node.js': 'Node.js 22+: Install from https://nodejs.org/',
  'uv': 'uv: Install with "pip install uv" or "curl -LsSf https://astral.sh/uv/install.sh | sh"',
  'pnpm': 'pnpm: Install with "npm install -g pnpm"',
  'nginx': 'nginx: Install from https://nginx.org/en/download.html'
};

/**
 * 环境检查器
 * 检查系统是否安装了 DeerFlow 所需的依赖项
 */
export class EnvChecker {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('EnvChecker');
  }

  /** 从命令输出中解析版本号 */
  private parseVersion(versionString: string): string {
    const match = versionString.match(/\d+\.\d+\.\d+|\d+\.\d+/);
    return match ? match[0] : '';
  }

  /** 比较两个版本号，返回 1(v1>v2), -1(v1<v2), 0(相等) */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  /** 执行 shell 命令并返回输出 */
  private runCommand(command: string): string {
    const result = spawnSync(command, [], {
      shell: true,
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true
    });
    if (result.error) {
      throw result.error;
    }
    return (result.stdout || '').trim();
  }

  /** 检查单个依赖项 */
  private checkDependency(config: DependencyConfig): { info?: DependencyInfo; error?: string } {
    try {
      this.logger.debug(`Checking ${config.name} at ${config.command}`);
      
      const output = this.runCommand(config.command);
      const version = this.parseVersion(output);
      
      if (!version) {
        return { error: `Could not parse ${config.name} version from: ${output}` };
      }

      if (config.minVersion && this.compareVersions(version, config.minVersion) < 0) {
        return {
          error: `${config.name} version ${version} is below minimum required ${config.minVersion}`
        };
      }

      let depPath = '';
      try {
        if (process.platform === 'win32') {
          depPath = this.runCommand(`where ${config.name.toLowerCase()}`).split('\n')[0];
        } else {
          const whichCmd = config.name === 'Python' ? 'which python3' : `which ${config.name.toLowerCase()}`;
          depPath = this.runCommand(whichCmd);
        }
      } catch {
        depPath = 'unknown';
      }

      this.logger.success(`✓ ${config.name} ${version}`);
      
      return {
        info: {
          version,
          path: depPath || 'unknown'
        }
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`✗ ${config.name} not found`);
      return { error: errorMsg };
    }
  }

  /** 更新检查结果中的依赖信息 */
  private updateResultWithInfo(result: EnvCheckResult, name: string, info: DependencyInfo): void {
    switch (name) {
      case 'Python':
        result.python = info;
        break;
      case 'Node.js':
        result.node = info;
        break;
      case 'uv':
        result.uv = info;
        break;
      case 'pnpm':
        result.pnpm = info;
        break;
      case 'nginx':
        result.nginx = info;
        break;
    }
  }

  /**
   * 执行环境依赖检查
   * @returns 检查结果，包含所有依赖项的状态
   */
  async check(): Promise<EnvCheckResult> {
    this.logger.info('Checking environment dependencies...');

    const result: EnvCheckResult = {
      success: true,
      missing: [],
      errors: []
    };

    for (const dep of DEPENDENCY_CONFIGS) {
      const checkResult = this.checkDependency(dep);
      
      if (checkResult.error) {
        result.success = false;
        result.missing.push(dep.name);
        result.errors.push(`${dep.name}: ${checkResult.error}`);
      } else if (checkResult.info) {
        this.updateResultWithInfo(result, dep.name, checkResult.info);
      }
    }

    if (result.success) {
      this.logger.info('All environment dependencies are satisfied');
    } else {
      this.logger.error(`Missing dependencies: ${result.missing.join(', ')}`);
      this.printInstallGuide(result.missing);
    }

    return result;
  }

  /** 打印缺失依赖项的安装指南 */
  private printInstallGuide(missing: string[]): void {
    this.logger.info('\n=== Installation Guide ===');
    
    for (const dep of missing) {
      const guide = INSTALL_GUIDES[dep];
      if (guide) {
        this.logger.info(guide);
      }
    }
    
    this.logger.info('========================\n');
  }
}
