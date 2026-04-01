import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import { dirname, join } from 'path';
import {
  registerServiceCommands,
  registerLogsCommands,
  registerConfigCommands,
  registerDoctorCommands
} from './commands';
import { CLIError, ErrorCode } from './utils/errors';
import type { IServiceManager, ServiceStatusInfo, ILogService, IConfigService } from '../core/interfaces/IServiceManager';
import type { ServiceInstance } from '../types';
import { ServiceStatus, ServiceName } from '../types';
import { ProcessManager } from '../modules/ProcessManager';
import { ProcessMonitor, ProcessStatus } from '../modules/ProcessMonitor';
import { LogManager } from '../modules/LogManager';
import { Logger, setDefaultLogger } from '../modules/Logger';
import { SERVICE_START_ORDER, getServiceDefinitions } from '../config/services';
import { existsSync } from 'fs';
import { getDeerFlowPath } from '../utils/env';

/** 获取日志目录路径 (launcher/logs) */
function getLogDir(): string {
  const cliDir = __dirname;
  const launcherDir = dirname(dirname(dirname(cliDir)));
  return join(launcherDir, 'logs');
}

/**
 * 日志服务适配器
 * 实现 ILogService 接口，提供日志读取、监听和清理功能
 */
class LogServiceAdapter implements ILogService {
  private logManager: LogManager;

  constructor() {
    this.logManager = new LogManager(getLogDir());
  }

  async getLogs(service: ServiceName | 'launcher', options?: {
    lines?: number;
    follow?: boolean;
    level?: string;
  }): Promise<string[]> {
    const filter: any = { service };
    if (options?.lines) filter.lines = options.lines;
    if (options?.level) filter.level = options.level.toUpperCase();

    try {
      const entries = this.logManager.readLogs(filter);
      return entries.map(e => e.raw);
    } catch {
      return [];
    }
  }

  watchLogs(service: ServiceName | 'launcher', callback: (line: string) => void): () => void {
    return this.logManager.follow(service, (entry) => {
      callback(entry.raw);
    });
  }

  async clearLogs(service: ServiceName | 'launcher'): Promise<void> {
    const logFile = this.logManager.getLogFilePath(service);
    try {
      if (fs.existsSync(logFile)) {
        fs.writeFileSync(logFile, '');
      }
    } catch (error) {
      console.error(`Failed to clear log for ${service}:`, error);
    }
  }

  async clearAllLogs(): Promise<void> {
    const services: (ServiceName | 'launcher')[] = [
      'launcher',
      ...SERVICE_START_ORDER
    ];
    for (const service of services) {
      await this.clearLogs(service);
    }
  }

  async getLogFiles(): Promise<string[]> {
    const stats = this.logManager.listLogFiles();
    return stats.map(s => s.file);
  }
}

/**
 * 配置服务适配器
 * 实现 IConfigService 接口，提供配置读取和验证功能
 */
class ConfigServiceAdapter implements IConfigService {
  async get(key: string): Promise<unknown> {
    switch (key) {
      case 'deerflowPath':
        return getDeerFlowPath();
      case 'logDir':
        return getLogDir();
      case 'services':
        return SERVICE_START_ORDER;
      default:
        return undefined;
    }
  }

  async set(_key: string, _value: unknown): Promise<void> {
    throw new CLIError(
      ErrorCode.CONFIG_PARSE_ERROR,
      'Configuration modification not supported in CLI mode'
    );
  }

  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (!existsSync(getDeerFlowPath())) {
      errors.push('DeerFlow path does not exist');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  async init(): Promise<void> {}
}

/**
 * 服务管理器适配器
 * 实现 IServiceManager 接口，整合进程管理、日志和配置服务
 */
class ServiceManagerAdapter implements IServiceManager {
  private processManager: ProcessManager;
  private processMonitor: ProcessMonitor;
  private logService: LogServiceAdapter;
  private configService: ConfigServiceAdapter;
  private logDir: string;
  private logger: Logger;

  constructor() {
    this.logDir = getLogDir();
    this.logger = new Logger('CLI', { logDir: this.logDir });
    setDefaultLogger(this.logger);
    this.processManager = new ProcessManager(this.logDir);
    this.processMonitor = new ProcessMonitor();
    this.logService = new LogServiceAdapter();
    this.configService = new ConfigServiceAdapter();
  }

  async start(options?: {
    only?: ServiceName[];
    watch?: boolean;
    detached?: boolean;
    timeout?: number;
    langsmith?: boolean;
  }): Promise<void> {
    try {
      await this.processManager.connect();
    } catch (error) {
      this.logger.error(`Failed to connect to process manager: ${error}`);
      throw error;
    }
    
    const services = options?.only 
      ? SERVICE_START_ORDER.filter((s): s is ServiceName => options.only!.includes(s))
      : SERVICE_START_ORDER;

    const serviceDefs = getServiceDefinitions(getDeerFlowPath(), { langsmith: options?.langsmith });
    const dependencies = new Map<ServiceName, ServiceInstance>();
    
    for (const name of services) {
      const def = serviceDefs.find(d => d.name === name);
      if (def) {
        if (options?.detached) {
          await this.processManager.startServiceDetached(def, dependencies);
          dependencies.set(name, { 
            name, 
            port: def.port, 
            status: ServiceStatus.STARTING
          });
        } else {
          await this.processManager.startService(def, dependencies);
          dependencies.set(name, { 
            name, 
            port: def.port, 
            status: ServiceStatus.HEALTHY 
          });
        }
      }
    }

    if (options?.detached) {
      try {
        await this.processManager.disconnect();
      } catch {}
    }
  }

  async stop(options?: {
    only?: ServiceName[];
    force?: boolean;
    timeout?: number;
  }): Promise<void> {
    try {
      await this.processManager.connect();
    } catch (error) {
      this.logger.error(`Failed to connect to process manager: ${error}`);
      throw error;
    }
    
    const services = options?.only 
      ? SERVICE_START_ORDER.filter((s): s is ServiceName => options.only!.includes(s))
      : SERVICE_START_ORDER;

    for (const name of services) {
      await this.processManager.stopService(name);
    }

    try {
      await this.processManager.disconnect();
    } catch {
      // Ignore disconnect errors - PM2 daemon may already be shutting down
    }
  }

  async restart(services?: ServiceName[]): Promise<void> {
    await this.stop({ only: services });
    await new Promise(r => setTimeout(r, 1000));
    await this.start({ only: services });
  }

  async getStatus(service?: ServiceName): Promise<ServiceStatusInfo | ServiceStatusInfo[]> {
    try {
      await this.processMonitor.connect();
    } catch (error) {
      this.logger.error(`Failed to connect to process monitor: ${error}`);
      throw error;
    }
    
    const statuses = await this.processMonitor.getStatus();
    
    try {
      await this.processMonitor.disconnect();
    } catch {}
    
    if (service) {
      const found = statuses.find(s => s.name === service);
      return found ? this.toStatusInfo(found) : {
        name: service,
        status: 'offline' as const,
        restartCount: 0
      };
    }
    
    return statuses.map(s => this.toStatusInfo(s));
  }

  async getAllStatus(): Promise<ServiceStatusInfo[]> {
    try {
      await this.processMonitor.connect();
    } catch (error) {
      this.logger.error(`Failed to connect to process monitor: ${error}`);
      throw error;
    }
    const statuses = await this.processMonitor.getStatus();
    
    try {
      await this.processMonitor.disconnect();
    } catch {}
    
    return statuses.map(s => this.toStatusInfo(s));
  }

  getLogService(): ILogService {
    return this.logService;
  }

  getConfigService(): IConfigService {
    return this.configService;
  }

  /** 将 PM2 状态字符串映射为 ServiceStatusInfo 状态 */
  private mapStatus(status: string): ServiceStatusInfo['status'] {
    const statusMap: Record<string, ServiceStatusInfo['status']> = {
      'stopped': 'offline',
      'unknown': 'offline',
      'launching': 'launching',
      'errored': 'errored',
      'online': 'online'
    };
    return statusMap[status] || 'offline';
  }

  /** 将毫秒格式化为可读的运行时间字符串 */
  private formatUptime(uptimeMs: number): string | undefined {
    if (!uptimeMs) return undefined;
    
    const totalSeconds = Math.floor(uptimeMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  private toStatusInfo(status: ProcessStatus): ServiceStatusInfo {
    return {
      name: status.name as ServiceName,
      status: this.mapStatus(status.status),
      cpu: `${status.cpu}%`,
      memory: `${Math.round(status.memory / 1024 / 1024)} MB`,
      pid: status.pid,
      uptime: this.formatUptime(status.uptime),
      restartCount: status.restarts,
      port: status.port
    };
  }
}

export async function createCLI(): Promise<Command> {
  const program = new Command();
  
  program
    .name('deerflow')
    .description('DeerFlow Desktop Launcher CLI')
    .version('0.3.0', '-v, --version');

  program.exitOverride();

  process.on('unhandledRejection', (reason: any) => {
    if (reason?.message?.includes('sock') || reason?.code === 'ECONNREFUSED') {
      return;
    }
    console.error(chalk.red('\nUnexpected error:'), reason);
    process.exit(ErrorCode.UNKNOWN_ERROR);
  });

  process.on('uncaughtException', (error: any) => {
    if (error?.message?.includes('sock') || error?.code === 'ECONNREFUSED') {
      return;
    }
    console.error(chalk.red('\nUnexpected error:'), error);
    process.exit(ErrorCode.UNKNOWN_ERROR);
  });

  const services = new ServiceManagerAdapter();

  registerServiceCommands(program, services);
  registerLogsCommands(program, services);
  registerConfigCommands(program, services);
  registerDoctorCommands(program, services);

  return program;
}

export async function runCLI(): Promise<void> {
  try {
    const program = await createCLI();
    await program.parseAsync(process.argv);
  } catch (error: any) {
    if (error?.code === 'commander.helpDisplayed' || error?.code === 'commander.version') {
      process.exit(0);
    }
    
    if (error instanceof CLIError) {
      console.error(chalk.red(`\nError [${error.code}]: ${error.message}`));
      
      if (error.suggestion) {
        console.error(chalk.yellow(`\n💡 ${error.suggestion}`));
      }
      
      process.exit(error.code);
    }
    
    throw error;
  }
}
