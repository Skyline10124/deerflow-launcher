import * as pm2 from 'pm2';
import type { ProcessDescription } from 'pm2';
import { execSync } from 'child_process';
import Table from 'cli-table3';
import chalk from 'chalk';
import { Logger, getLogger } from './Logger';
import { ServiceName } from '../types';

export interface ProcessStatus {
  name: string;
  status: 'online' | 'offline' | 'stopped' | 'errored' | 'launching' | 'stopping' | 'unknown';
  cpu: number;
  memory: number;
  restarts: number;
  uptime: number;
  pid?: number;
  port?: number;
}

export interface MonitorConfig {
  checkInterval: number;
  maxRetries: number;
  backoffMultiplier: number;
  baseDelay: number;
  maxDelay: number;
}

const DEFAULT_CONFIG: MonitorConfig = {
  checkInterval: 5000,
  maxRetries: 3,
  backoffMultiplier: 2,
  baseDelay: 1000,
  maxDelay: 30000
};

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(0))} ${sizes[i]}`;
}

export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export function formatStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    online: chalk.green,
    offline: chalk.gray,
    stopped: chalk.gray,
    stopping: chalk.yellow,
    launching: chalk.yellow,
    errored: chalk.red
  };
  return (colors[status] || chalk.white)(status);
}

export function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    online: chalk.green('●'),
    offline: chalk.gray('○'),
    launching: chalk.yellow('●'),
    stopping: chalk.yellow('●'),
    errored: chalk.red('●'),
    stopped: chalk.gray('○'),
    unknown: chalk.gray('○')
  };
  return icons[status] || chalk.gray('○');
}

const ALL_SERVICES = ['langgraph', 'gateway', 'frontend', 'nginx'];

export function formatStatusTable(statuses: ProcessStatus[]): string {
  const table = new Table({
    head: ['Service', 'Status', 'CPU', 'Memory', 'PID', 'Uptime', 'Restarts'],
    style: { 
      head: ['cyan', 'bold'],
      border: ['gray']
    },
    colWidths: [12, 14, 8, 12, 8, 18, 10]
  });

  const statusMap = new Map(statuses.map(s => [s.name, s]));

  for (const serviceName of ALL_SERVICES) {
    const s = statusMap.get(serviceName);
    if (s) {
      const icon = getStatusIcon(s.status);
      table.push([
        chalk.bold(s.name),
        `${icon} ${formatStatus(s.status)}`,
        `${s.cpu}%`,
        formatBytes(s.memory),
        s.pid?.toString() || '-',
        formatUptime(s.uptime),
        s.restarts.toString()
      ]);
    } else {
      const icon = getStatusIcon('offline');
      table.push([
        chalk.bold(serviceName),
        `${icon} ${formatStatus('offline')}`,
        '0%',
        '0 B',
        '-',
        '-',
        '0'
      ]);
    }
  }

  return table.toString();
}

export function formatSimpleList(statuses: ProcessStatus[]): string {
  const lines: string[] = [];
  
  for (const s of statuses) {
    const statusIcon = s.status === 'online' ? chalk.green('●')
      : s.status === 'stopped' || s.status === 'unknown' ? chalk.gray('○')
      : s.status === 'errored' ? chalk.red('●')
      : chalk.yellow('●');
    
    lines.push(
      `${statusIcon} ${chalk.bold(s.name.padEnd(12))} ` +
      `${formatStatus(s.status).padEnd(10)} ` +
      `${chalk.gray(formatBytes(s.memory))} ` +
      `${chalk.gray(formatUptime(s.uptime))}`
    );
  }
  
  return lines.join('\n');
}

export class ProcessMonitor {
  private logger: Logger;
  private config: MonitorConfig;
  private checkTimer: NodeJS.Timeout | null = null;
  private connected: boolean = false;
  private restartAttempts: Map<string, number> = new Map();
  private lastRestartTime: Map<string, number> = new Map();
  private onServiceError?: (serviceName: string, error: Error) => void;

  constructor(config: Partial<MonitorConfig> = {}) {
    this.logger = getLogger('ProcMonitor');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    await new Promise<void>((resolve, reject) => {
      pm2.connect((err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          this.connected = true;
          this.logger.debug('ProcessMonitor connected to PM2');
          resolve();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    this.stopMonitoring();
    pm2.disconnect();
    this.connected = false;
    this.logger.debug('ProcessMonitor disconnected');
  }

  onError(handler: (serviceName: string, error: Error) => void): void {
    this.onServiceError = handler;
  }

  startMonitoring(services: ServiceName[]): void {
    if (this.checkTimer) {
      this.stopMonitoring();
    }

    this.logger.info('Starting process monitoring...');
    
    this.checkTimer = setInterval(async () => {
      await this.checkProcesses(services);
    }, this.config.checkInterval);

    this.checkProcesses(services).catch(() => {});
  }

  stopMonitoring(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      this.logger.info('Process monitoring stopped');
    }
  }

  private async checkProcesses(services: ServiceName[]): Promise<void> {
    if (!this.connected) return;

    try {
      const processes = await this.listProcesses();
      
      for (const serviceName of services) {
        const proc = processes.find(p => p.name === serviceName);
        
        if (!proc) {
          continue;
        }

        const pm2Status = proc.pm2_env?.status;
        
        if (pm2Status === 'errored') {
          await this.handleProcessError(serviceName, proc);
        } else if (pm2Status === 'online') {
          this.restartAttempts.set(serviceName, 0);
        }
      }
    } catch (error) {
      this.logger.debug(`Check processes error: ${error}`);
    }
  }

  private async handleProcessError(serviceName: string, _proc: unknown): Promise<void> {
    const attempts = this.restartAttempts.get(serviceName) || 0;
    
    if (attempts >= this.config.maxRetries) {
      this.logger.error(`${serviceName} exceeded max restart attempts (${this.config.maxRetries})`);
      if (this.onServiceError) {
        this.onServiceError(serviceName, new Error(`Max restart attempts exceeded`));
      }
      return;
    }

    const now = Date.now();
    const lastRestart = this.lastRestartTime.get(serviceName) || 0;
    const delay = Math.min(
      this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempts),
      this.config.maxDelay
    );

    if (now - lastRestart < delay) {
      return;
    }

    this.logger.warn(`${serviceName} process error, attempting restart (${attempts + 1}/${this.config.maxRetries})...`);
    
    try {
      await this.restartProcess(serviceName);
      this.restartAttempts.set(serviceName, attempts + 1);
      this.lastRestartTime.set(serviceName, now);
      this.logger.info(`${serviceName} restarted successfully`);
    } catch (error) {
      this.logger.error(`Failed to restart ${serviceName}: ${error}`);
      if (this.onServiceError) {
        this.onServiceError(serviceName, error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  private async restartProcess(name: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      pm2.restart(name, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async listProcesses(): Promise<ProcessDescription[]> {
    if (!this.connected) return [];
    
    return new Promise<ProcessDescription[]>((resolve, reject) => {
      pm2.list((err: Error | null, list: ProcessDescription[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(list);
        }
      });
    });
  }

  async getStatus(): Promise<ProcessStatus[]> {
    if (!this.connected) {
      await this.connect();
    }

    const processes = await this.listProcesses();
    
    let winMetricsMap: Map<number, { cpu: number; memory: number }> = new Map();
    if (process.platform === 'win32') {
      winMetricsMap = this.getAllWindowsProcessMetrics();
    }
    
    return processes
      .filter((proc): proc is ProcessDescription & { name: string } => !!proc.name)
      .map(proc => {
        const pid = proc.pid;
        let cpu = proc.monit?.cpu || 0;
        let memory = proc.monit?.memory || 0;
        
        if (pid && winMetricsMap.has(pid)) {
          const winMetrics = winMetricsMap.get(pid);
          if (winMetrics) {
            cpu = winMetrics.cpu;
            memory = winMetrics.memory;
          }
        }
        
        return {
          name: proc.name,
          status: this.mapStatus(proc.pm2_env?.status),
          cpu,
          memory,
          restarts: proc.pm2_env?.restart_time || 0,
          uptime: proc.pm2_env?.pm_uptime ? Date.now() - proc.pm2_env.pm_uptime : 0,
          pid: proc.pid
        };
      });
  }

  private getAllWindowsProcessMetrics(): Map<number, { cpu: number; memory: number }> {
    const result = new Map<number, { cpu: number; memory: number }>();
    
    try {
      const cpuOutput = execSync(
        'wmic path Win32_PerfFormattedData_PerfProc_Process get IDProcess,PercentProcessorTime /value',
        { encoding: 'utf-8', timeout: 3000, windowsHide: true }
      );
      
      const memOutput = execSync(
        'wmic process get ProcessId,WorkingSetSize /value',
        { encoding: 'utf-8', timeout: 3000, windowsHide: true }
      );
      
      const cpuMap = new Map<number, number>();
      const cpuRegex = /IDProcess=(\d+)\s+PercentProcessorTime=(\d+)/g;
      let cpuMatch;
      while ((cpuMatch = cpuRegex.exec(cpuOutput)) !== null) {
        cpuMap.set(parseInt(cpuMatch[1], 10), parseInt(cpuMatch[2], 10));
      }
      
      const memRegex = /ProcessId=(\d+)\s+WorkingSetSize=(\d+)/g;
      let memMatch;
      while ((memMatch = memRegex.exec(memOutput)) !== null) {
        const pid = parseInt(memMatch[1], 10);
        const memory = parseInt(memMatch[2], 10);
        const cpu = cpuMap.get(pid) || 0;
        result.set(pid, { cpu, memory });
      }
    } catch {
      // Ignore errors
    }
    
    return result;
  }

  private mapStatus(pm2Status?: string): ProcessStatus['status'] {
    switch (pm2Status) {
      case 'online':
        return 'online';
      case 'stopped':
        return 'stopped';
      case 'errored':
        return 'errored';
      case 'launching':
        return 'launching';
      default:
        return 'unknown';
    }
  }

  getMetrics(): { restartAttempts: Map<string, number>; isMonitoring: boolean } {
    return {
      restartAttempts: new Map(this.restartAttempts),
      isMonitoring: this.checkTimer !== null
    };
  }
}
