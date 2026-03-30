import { execSync, spawnSync } from 'child_process';
import { Logger, getLogger } from './Logger';
import { EnvCheckResult, DependencyInfo, ErrorCodes } from '../types';

interface DependencyConfig {
  name: string;
  command: string;
  versionRegex: RegExp;
  minVersion?: string;
  errorCode: string;
  versionErrorCode?: string;
}

export class EnvChecker {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('EnvChecker');
  }

  private parseVersion(versionString: string): string {
    const match = versionString.match(/\d+\.\d+\.\d+|\d+\.\d+/);
    return match ? match[0] : '';
  }

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

  private runCommand(command: string): string {
    try {
      const result = spawnSync(command, [], {
        shell: true,
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true
      });
      return (result.stdout || '').trim();
    } catch {
      return '';
    }
  }

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

  async check(): Promise<EnvCheckResult> {
    this.logger.info('Checking environment dependencies...');

    const dependencies: DependencyConfig[] = [
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

    const result: EnvCheckResult = {
      success: true,
      missing: [],
      errors: []
    };

    for (const dep of dependencies) {
      const checkResult = this.checkDependency(dep);
      
      if (checkResult.error) {
        result.success = false;
        result.missing.push(dep.name);
        result.errors.push(`${dep.name}: ${checkResult.error}`);
      } else if (checkResult.info) {
        switch (dep.name) {
          case 'Python':
            result.python = checkResult.info;
            break;
          case 'Node.js':
            result.node = checkResult.info;
            break;
          case 'uv':
            result.uv = checkResult.info;
            break;
          case 'pnpm':
            result.pnpm = checkResult.info;
            break;
          case 'nginx':
            result.nginx = checkResult.info;
            break;
        }
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

  private printInstallGuide(missing: string[]): void {
    this.logger.info('\n=== Installation Guide ===');
    
    for (const dep of missing) {
      switch (dep) {
        case 'Python':
          this.logger.info('Python 3.12+: Install from https://www.python.org/downloads/');
          break;
        case 'Node.js':
          this.logger.info('Node.js 22+: Install from https://nodejs.org/');
          break;
        case 'uv':
          this.logger.info('uv: Install with "pip install uv" or "curl -LsSf https://astral.sh/uv/install.sh | sh"');
          break;
        case 'pnpm':
          this.logger.info('pnpm: Install with "npm install -g pnpm"');
          break;
        case 'nginx':
          this.logger.info('nginx: Install from https://nginx.org/en/download.html');
          break;
      }
    }
    
    this.logger.info('========================\n');
  }
}
