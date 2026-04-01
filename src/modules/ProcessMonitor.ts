/**
 * 进程监控模块
 * Process Monitor Module
 * 
 * 提供 PM2 进程状态监控、自动重启和状态展示功能
 * Provides PM2 process status monitoring, auto-restart, and status display
 * 
 * @module ProcessMonitor
 */

import * as pm2 from 'pm2';
import type { ProcessDescription } from 'pm2';
import { execSync } from 'child_process';
import Table from 'cli-table3';
import chalk from 'chalk';
import { Logger, getLogger } from './Logger';
import { ServiceName } from '../types';

/**
 * 进程状态接口
 * Process Status Interface
 * 
 * 描述单个进程的运行状态
 * Describes the running status of a single process
 */
export interface ProcessStatus {
  /** 进程名称 / Process name */
  name: string;
  /** 进程状态 / Process status */
  status: 'online' | 'offline' | 'stopped' | 'errored' | 'launching' | 'stopping' | 'unknown';
  /** CPU 使用率 (%) / CPU usage percentage */
  cpu: number;
  /** 内存使用量 (bytes) / Memory usage in bytes */
  memory: number;
  /** 重启次数 / Number of restarts */
  restarts: number;
  /** 运行时间 (ms) / Uptime in milliseconds */
  uptime: number;
  /** 进程 ID / Process ID */
  pid?: number;
  /** 端口号 / Port number */
  port?: number;
}

/**
 * 监控配置接口
 * Monitor Configuration Interface
 */
export interface MonitorConfig {
  /** 检查间隔 (ms) / Check interval in milliseconds */
  checkInterval: number;
  /** 最大重试次数 / Maximum retry attempts */
  maxRetries: number;
  /** 退避乘数 / Backoff multiplier for retry delay */
  backoffMultiplier: number;
  /** 基础延迟 (ms) / Base delay in milliseconds */
  baseDelay: number;
  /** 最大延迟 (ms) / Maximum delay in milliseconds */
  maxDelay: number;
}

/**
 * 默认监控配置
 * Default monitor configuration
 */
const DEFAULT_CONFIG: MonitorConfig = {
  checkInterval: 5000,      // 每 5 秒检查一次 / Check every 5 seconds
  maxRetries: 3,            // 最多重试 3 次 / Maximum 3 retries
  backoffMultiplier: 2,     // 指数退避乘数 / Exponential backoff multiplier
  baseDelay: 1000,          // 基础延迟 1 秒 / Base delay 1 second
  maxDelay: 30000           // 最大延迟 30 秒 / Maximum delay 30 seconds
};

/**
 * 格式化字节数为可读字符串
 * Format bytes to human-readable string
 * 
 * @param bytes - 字节数 / Number of bytes
 * @returns 格式化后的字符串 / Formatted string
 * @example formatBytes(1024) => '1 KB'
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(0))} ${sizes[i]}`;
}

/**
 * 格式化运行时间为可读字符串
 * Format uptime to human-readable string
 * 
 * @param ms - 毫秒数 / Milliseconds
 * @returns 格式化后的字符串 / Formatted string
 * @example formatUptime(3600000) => '1h 0m'
 */
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

/**
 * 格式化状态字符串 (带颜色)
 * Format status string with color
 * 
 * @param status - 状态字符串 / Status string
 * @returns 带颜色的状态字符串 / Colored status string
 */
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

/**
 * 获取状态图标
 * Get status icon
 * 
 * @param status - 状态字符串 / Status string
 * @returns 状态图标 / Status icon
 */
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

/**
 * 所有服务名称列表
 * List of all service names
 * 用于状态表格显示顺序
 * Used for status table display order
 */
const ALL_SERVICES = ['langgraph', 'gateway', 'frontend', 'nginx'];

/**
 * 格式化状态表格
 * Format status table
 * 
 * 生成 CLI 表格格式的服务状态
 * Generates service status in CLI table format
 * 
 * @param statuses - 进程状态列表 / Process status list
 * @returns 表格字符串 / Table string
 */
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

  // 按固定顺序显示服务 / Display services in fixed order
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
      // 服务未运行时显示离线状态 / Show offline status when service not running
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

/**
 * 格式化简单列表
 * Format simple list
 * 
 * 生成简洁的列表格式服务状态
 * Generates service status in simple list format
 * 
 * @param statuses - 进程状态列表 / Process status list
 * @returns 列表字符串 / List string
 */
export function formatSimpleList(statuses: ProcessStatus[]): string {
  const lines: string[] = [];
  
  for (const s of statuses) {
    // 根据状态选择图标 / Select icon based on status
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

/**
 * 进程监控器
 * Process Monitor
 * 
 * 监控 PM2 管理的进程状态，支持自动重启和错误处理
 * Monitors PM2-managed process status with auto-restart and error handling
 * 
 * 主要功能 / Key Features:
 * - 定期检查进程状态 / Periodic process status check
 * - 自动重启崩溃进程 / Auto-restart crashed processes
 * - 指数退避重试策略 / Exponential backoff retry strategy
 * - Windows 平台 CPU/内存指标获取 / Windows platform CPU/memory metrics
 */
export class ProcessMonitor {
  /** 日志记录器 / Logger instance */
  private logger: Logger;
  /** 监控配置 / Monitor configuration */
  private config: MonitorConfig;
  /** 检查定时器 / Check timer */
  private checkTimer: NodeJS.Timeout | null = null;
  /** PM2 连接状态 / PM2 connection status */
  private connected: boolean = false;
  /** 服务重启次数映射 / Service restart attempts map */
  private restartAttempts: Map<string, number> = new Map();
  /** 服务上次重启时间映射 / Service last restart time map */
  private lastRestartTime: Map<string, number> = new Map();
  /** 错误处理回调 / Error handler callback */
  private onServiceError?: (serviceName: string, error: Error) => void;

  /**
   * 创建进程监控器实例
   * Create a ProcessMonitor instance
   * 
   * @param config - 部分监控配置 / Partial monitor configuration
   */
  constructor(config: Partial<MonitorConfig> = {}) {
    this.logger = getLogger('ProcMonitor');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 连接到 PM2
   * Connect to PM2
   */
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

  /**
   * 断开与 PM2 的连接
   * Disconnect from PM2
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    this.stopMonitoring();
    pm2.disconnect();
    this.connected = false;
    this.logger.debug('ProcessMonitor disconnected');
  }

  /**
   * 注册错误处理回调
   * Register error handler callback
   * 
   * @param handler - 错误处理函数 / Error handler function
   */
  onError(handler: (serviceName: string, error: Error) => void): void {
    this.onServiceError = handler;
  }

  /**
   * 开始监控
   * Start monitoring
   * 
   * 启动定期检查进程状态
   * Starts periodic process status checking
   * 
   * @param services - 要监控的服务列表 / Services to monitor
   */
  startMonitoring(services: ServiceName[]): void {
    if (this.checkTimer) {
      this.stopMonitoring();
    }

    this.logger.info('Starting process monitoring...');
    
    // 设置定时检查 / Set up periodic check
    this.checkTimer = setInterval(async () => {
      await this.checkProcesses(services);
    }, this.config.checkInterval);

    // 立即执行一次检查 / Execute check immediately
    this.checkProcesses(services).catch(() => {});
  }

  /**
   * 停止监控
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      this.logger.info('Process monitoring stopped');
    }
  }

  /**
   * 检查进程状态
   * Check process status
   * 
   * @param services - 要检查的服务列表 / Services to check
   */
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
        
        // 处理错误状态的进程 / Handle errored processes
        if (pm2Status === 'errored') {
          await this.handleProcessError(serviceName, proc);
        } else if (pm2Status === 'online') {
          // 重置重启计数 / Reset restart counter
          this.restartAttempts.set(serviceName, 0);
        }
      }
    } catch (error) {
      this.logger.debug(`Check processes error: ${error}`);
    }
  }

  /**
   * 处理进程错误
   * Handle process error
   * 
   * 使用指数退避策略尝试重启进程
   * Attempts to restart process with exponential backoff strategy
   * 
   * @param serviceName - 服务名称 / Service name
   * @param _proc - 进程信息 (未使用) / Process info (unused)
   */
  private async handleProcessError(serviceName: string, _proc: unknown): Promise<void> {
    const attempts = this.restartAttempts.get(serviceName) || 0;
    
    // 超过最大重试次数 / Exceeded max retry attempts
    if (attempts >= this.config.maxRetries) {
      this.logger.error(`${serviceName} exceeded max restart attempts (${this.config.maxRetries})`);
      if (this.onServiceError) {
        this.onServiceError(serviceName, new Error(`Max restart attempts exceeded`));
      }
      return;
    }

    // 检查是否需要等待退避时间 / Check if need to wait for backoff
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

  /**
   * 重启进程
   * Restart process
   * 
   * @param name - 进程名称 / Process name
   */
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

  /**
   * 获取所有 PM2 进程列表
   * Get list of all PM2 processes
   * 
   * @returns 进程描述列表 / Process description list
   */
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

  /**
   * 获取所有进程状态
   * Get all process status
   * 
   * @returns 进程状态列表 / Process status list
   */
  async getStatus(): Promise<ProcessStatus[]> {
    if (!this.connected) {
      await this.connect();
    }

    const processes = await this.listProcesses();
    
    // Windows 平台需要额外获取 CPU/内存指标 / Windows needs extra CPU/memory metrics
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
        
        // 使用 Windows 指标覆盖 PM2 指标 / Override PM2 metrics with Windows metrics
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

  /**
   * 获取 Windows 平台所有进程的 CPU 和内存指标
   * Get CPU and memory metrics for all processes on Windows
   * 
   * 使用 WMIC 命令获取准确的进程指标
   * Uses WMIC commands to get accurate process metrics
   * 
   * @returns PID 到指标的映射 / PID to metrics map
   */
  private getAllWindowsProcessMetrics(): Map<number, { cpu: number; memory: number }> {
    const result = new Map<number, { cpu: number; memory: number }>();
    
    try {
      // 获取 CPU 使用率 / Get CPU usage
      const cpuOutput = execSync(
        'wmic path Win32_PerfFormattedData_PerfProc_Process get IDProcess,PercentProcessorTime /value',
        { encoding: 'utf-8', timeout: 3000, windowsHide: true }
      );
      
      // 获取内存使用量 / Get memory usage
      const memOutput = execSync(
        'wmic process get ProcessId,WorkingSetSize /value',
        { encoding: 'utf-8', timeout: 3000, windowsHide: true }
      );
      
      // 解析 CPU 数据 / Parse CPU data
      const cpuMap = new Map<number, number>();
      const cpuRegex = /IDProcess=(\d+)\s+PercentProcessorTime=(\d+)/g;
      let cpuMatch;
      while ((cpuMatch = cpuRegex.exec(cpuOutput)) !== null) {
        cpuMap.set(parseInt(cpuMatch[1], 10), parseInt(cpuMatch[2], 10));
      }
      
      // 解析内存数据并合并 / Parse memory data and merge
      const memRegex = /ProcessId=(\d+)\s+WorkingSetSize=(\d+)/g;
      let memMatch;
      while ((memMatch = memRegex.exec(memOutput)) !== null) {
        const pid = parseInt(memMatch[1], 10);
        const memory = parseInt(memMatch[2], 10);
        const cpu = cpuMap.get(pid) || 0;
        result.set(pid, { cpu, memory });
      }
    } catch {
      // 忽略错误 / Ignore errors
    }
    
    return result;
  }

  /**
   * 映射 PM2 状态到内部状态
   * Map PM2 status to internal status
   * 
   * @param pm2Status - PM2 状态字符串 / PM2 status string
   * @returns 内部状态 / Internal status
   */
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

  /**
   * 获取监控指标
   * Get monitoring metrics
   * 
   * @returns 监控指标对象 / Monitoring metrics object
   */
  getMetrics(): { restartAttempts: Map<string, number>; isMonitoring: boolean } {
    return {
      restartAttempts: new Map(this.restartAttempts),
      isMonitoring: this.checkTimer !== null
    };
  }
}
