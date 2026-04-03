import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { Logger, getLogger } from './Logger.js';
import { safeSpawnSync } from '../utils/command.js';
import { compareVersions } from '../utils/version.js';
import { VERSION_REQUIREMENTS } from '../utils/requirements.js';

export interface DoctorCheckItem {
  category: 'runtime' | 'package' | 'service' | 'network' | 'config';
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message: string;
  details?: string;
}

export interface DoctorReport {
  timestamp: string;
  checks: DoctorCheckItem[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
  success: boolean;
}

export interface DoctorOptions {
  deerflowPath: string;
  json?: boolean;
  save?: boolean;
}

const REQUIRED_PORTS = [2024, 8001, 3000, 2026];

const REQUIRED_CONFIGS = [
  'config.yaml',
  '.env',
  'frontend/.env',
  'extensions_config.json',
  'nginx.conf'
];

export class EnvDoctor {
  private logger: Logger;
  private deerflowPath: string;

  constructor(deerflowPath: string) {
    this.logger = getLogger('EnvDoctor');
    this.deerflowPath = deerflowPath;
  }

  async diagnose(): Promise<DoctorReport> {
    this.logger.info('Running environment diagnostics...');

    const checks: DoctorCheckItem[] = [];

    checks.push(...await this.checkRuntimes());
    checks.push(...await this.checkPackages());
    checks.push(...await this.checkService());
    checks.push(...await this.checkNetwork());
    checks.push(...await this.checkConfigs());

    const summary = {
      total: checks.length,
      passed: checks.filter(c => c.status === 'pass').length,
      failed: checks.filter(c => c.status === 'fail').length,
      warnings: checks.filter(c => c.status === 'warn').length,
      skipped: checks.filter(c => c.status === 'skip').length
    };

    const report: DoctorReport = {
      timestamp: new Date().toISOString(),
      checks,
      summary,
      success: summary.failed === 0
    };

    return report;
  }

  private async checkRuntimes(): Promise<DoctorCheckItem[]> {
    const checks: DoctorCheckItem[] = [];

    const runtimes = [
      { name: 'Python', command: process.platform === 'win32' ? 'python --version' : 'python3 --version', minVersion: VERSION_REQUIREMENTS.python.min },
      { name: 'Node.js', command: 'node --version', minVersion: VERSION_REQUIREMENTS.node.min }
    ];

    for (const rt of runtimes) {
      const result = this.checkCommand(rt.command, rt.minVersion);
      checks.push({
        category: 'runtime',
        name: rt.name,
        status: result.status,
        message: result.message,
        details: result.version
      });
    }

    return checks;
  }

  private async checkPackages(): Promise<DoctorCheckItem[]> {
    const checks: DoctorCheckItem[] = [];

    const packages = [
      { name: 'uv', command: 'uv --version' },
      { name: 'pnpm', command: 'pnpm --version', minVersion: '8.0.0' }
    ];

    for (const pkg of packages) {
      const result = this.checkCommand(pkg.command, pkg.minVersion);
      checks.push({
        category: 'package',
        name: pkg.name,
        status: result.status,
        message: result.message,
        details: result.version
      });
    }

    return checks;
  }

  private async checkService(): Promise<DoctorCheckItem[]> {
    const checks: DoctorCheckItem[] = [];

    const result = this.checkCommand('nginx -v', VERSION_REQUIREMENTS.nginx.min);

    checks.push({
      category: 'service',
      name: 'nginx',
      status: result.status,
      message: result.message,
      details: result.version
    });

    return checks;
  }

  private async checkNetwork(): Promise<DoctorCheckItem[]> {
    const checks: DoctorCheckItem[] = [];

    for (const port of REQUIRED_PORTS) {
      const available = await this.isPortAvailable(port);
      checks.push({
        category: 'network',
        name: `Port ${port}`,
        status: available ? 'pass' : 'warn',
        message: available ? '可用' : '已被占用',
        details: available ? undefined : '服务启动时可能冲突'
      });
    }

    return checks;
  }

  private async checkConfigs(): Promise<DoctorCheckItem[]> {
    const checks: DoctorCheckItem[] = [];

    for (const config of REQUIRED_CONFIGS) {
      const configPath = path.join(this.deerflowPath, config);
      const exists = fs.existsSync(configPath);
      
      checks.push({
        category: 'config',
        name: config,
        status: exists ? 'pass' : 'fail',
        message: exists ? '存在' : '不存在',
        details: exists ? configPath : `需要创建 ${config}`
      });
    }

    return checks;
  }

  private checkCommand(command: string, minVersion?: string): { status: DoctorCheckItem['status']; message: string; version?: string } {
    try {
      const result = safeSpawnSync(command, { timeout: 5000 });

      if (result.error) throw result.error;

      const output = (result.stdout || result.stderr || '').trim();
      const versionMatch = output.match(/\d+\.\d+\.\d+|\d+\.\d+/);
      const version = versionMatch ? versionMatch[0] : '';

      if (!version) {
        return { status: 'fail', message: '未找到' };
      }

      if (minVersion && compareVersions(version, minVersion) < 0) {
        return { 
          status: 'fail', 
          message: `版本过低 (当前: ${version}, 需要: ${minVersion})`,
          version 
        };
      }

      return { status: 'pass', message: `✓ ${version}`, version };
    } catch {
      return { status: 'fail', message: '未安装' };
    }
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const server = net.createServer();
      
      server.once('error', () => {
        resolve(false);
      });
      
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      
      server.listen(port, 'localhost');
    });
  }

  formatReport(report: DoctorReport): string {
    const lines: string[] = [];
    
    lines.push(`\n=== DeerFlow 环境诊断报告 ===`);
    lines.push(`时间: ${report.timestamp}\n`);

    const categories = ['runtime', 'package', 'service', 'network', 'config'] as const;
    const categoryNames = {
      runtime: '运行时',
      package: '包管理器',
      service: '服务',
      network: '网络',
      config: '配置'
    };

    for (const cat of categories) {
      const items = report.checks.filter(c => c.category === cat);
      if (items.length === 0) continue;

      lines.push(`[${categoryNames[cat]}]`);
      
      for (const item of items) {
        const symbol = this.getStatusSymbol(item.status);
        lines.push(`  ${symbol} ${item.name}: ${item.message}`);
        if (item.details && item.status !== 'pass') {
          lines.push(`      ${item.details}`);
        }
      }
      lines.push('');
    }

    lines.push(`=== 摘要 ===`);
    lines.push(`总计: ${report.summary.total} 项`);
    lines.push(`通过: ${report.summary.passed} 项`);
    if (report.summary.failed > 0) {
      lines.push(`失败: ${report.summary.failed} 项`);
    }
    if (report.summary.warnings > 0) {
      lines.push(`警告: ${report.summary.warnings} 项`);
    }
    lines.push(`\n结果: ${report.success ? '✓ 环境检查通过' : '✗ 存在问题需要修复'}`);

    return lines.join('\n');
  }

  private getStatusSymbol(status: DoctorCheckItem['status']): string {
    switch (status) {
      case 'pass': return '[✓]';
      case 'fail': return '[✗]';
      case 'warn': return '[!]';
      case 'skip': return '[-]';
    }
  }

  toJSON(report: DoctorReport): string {
    return JSON.stringify(report, null, 2);
  }

  async saveReport(report: DoctorReport, savePath: string): Promise<void> {
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const content = `# DeerFlow 环境诊断报告\n\n生成时间: ${report.timestamp}\n\n${this.formatReport(report)}`;
    fs.writeFileSync(savePath, content, 'utf-8');
    
    this.logger.info(`诊断报告已保存到: ${savePath}`);
  }
}
