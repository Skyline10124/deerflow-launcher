import PM2 from 'pm2';
import { execSync } from 'child_process';
import { Logger, getLogger } from './Logger';
import { ServiceName, ServiceStatus } from '../types';

export interface ProcessStatus {
  name: string;
  status: 'online' | 'stopped' | 'errored' | 'launching' | 'unknown';
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
      PM2.connect((err: Error | null) => {
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
    PM2.disconnect();
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

  private async handleProcessError(serviceName: string, proc: any): Promise<void> {
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
      PM2.restart(name, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async listProcesses(): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) => {
      PM2.list((err: Error | null, list: any[]) => {
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
    
    return processes.map(proc => {
      const pid = proc.pid;
      let cpu = proc.monit?.cpu || 0;
      let memory = proc.monit?.memory || 0;
      
      if (process.platform === 'win32' && pid) {
        const winMetrics = this.getWindowsProcessMetrics(pid);
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
        pid: proc.pid,
        port: proc.pm2_env?.env?.PORT
      };
    });
  }

  private getWindowsProcessMetrics(pid: number): { cpu: number; memory: number } | null {
    try {
      const script = `$ErrorActionPreference='SilentlyContinue';$p=Get-Process -Id ${pid};if($p){$mem=$p.WorkingSet64;$perf=Get-CimInstance Win32_PerfFormattedData_PerfProc_Process|Where-Object{$_.IDProcess -eq ${pid}};$cpu=if($perf){$perf.PercentProcessorTime}else{0};@{CPU=[math]::Round($cpu,1);Memory=$mem}|ConvertTo-Json -Compress}`;
      const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
      const output = execSync(
        `pwsh -NoProfile -EncodedCommand ${encodedScript}`,
        { encoding: 'utf-8', timeout: 5000, windowsHide: true }
      );
      
      const data = JSON.parse(output.trim());
      if (data) {
        return { cpu: Math.round(data.CPU || 0), memory: data.Memory || 0 };
      }
    } catch {
      // Fallback to tasklist for memory only
      try {
        const output = execSync(
          `tasklist /fi "PID eq ${pid}" /fo csv /nh`,
          { encoding: 'utf-8', timeout: 3000, windowsHide: true }
        );
        
        const match = output.match(/"[^"]+","(\d+)","[^"]*","[^"]*","([\d,]+)\s*K"/i);
        if (match) {
          const memoryKB = parseInt(match[2].replace(/,/g, ''), 10);
          const memory = memoryKB * 1024;
          return { cpu: 0, memory };
        }
      } catch {
        // Ignore errors
      }
    }
    return null;
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

  formatStatusTable(statuses: ProcessStatus[]): string {
    const lines: string[] = [];
    
    lines.push('┌────────────┬──────────┬───────┬─────────┬──────────┬──────────┐');
    lines.push('│ Service    │ Status   │ CPU   │ Memory  │ Restarts │ Uptime   │');
    lines.push('├────────────┼──────────┼───────┼─────────┼──────────┼──────────┤');
    
    for (const s of statuses) {
      const status = s.status.padEnd(8);
      const cpu = `${s.cpu}%`.padStart(5);
      const memory = this.formatMemory(s.memory).padStart(7);
      const restarts = String(s.restarts).padStart(8);
      const uptime = this.formatUptime(s.uptime).padStart(8);
      
      lines.push(`│ ${s.name.padEnd(10)} │ ${status} │ ${cpu} │ ${memory} │ ${restarts} │ ${uptime} │`);
    }
    
    lines.push('└────────────┴──────────┴───────┴─────────┴──────────┴──────────┘');
    
    return lines.join('\n');
  }

  private formatMemory(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  getMetrics(): { restartAttempts: Map<string, number>; isMonitoring: boolean } {
    return {
      restartAttempts: new Map(this.restartAttempts),
      isMonitoring: this.checkTimer !== null
    };
  }
}
