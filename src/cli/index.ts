import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import { join } from 'path';
import {
  registerServiceCommands,
  registerLogsCommands,
  registerConfigCommands,
  registerDoctorCommands,
  registerDemoCommand
} from './commands/index.js';
import { CLIError, ErrorCode } from './utils/errors.js';
import type { IServiceManager, ServiceStatusInfo, ILogService, IConfigService } from '../core/interfaces/IServiceManager.js';
import type { ServiceInstance } from '../types/index.js';
import { ServiceStatus, ServiceName } from '../types/index.js';
import { ProcessManager } from '../modules/ProcessManager.js';
import { ProcessMonitor, ProcessStatus } from '../modules/ProcessMonitor.js';
import { LogManager } from '../modules/LogManager.js';
import { Logger, setDefaultLogger } from '../modules/Logger.js';
import { ConfigInitializer } from '../modules/ConfigInitializer.js';
import { SERVICE_START_ORDER, getServiceDefinitions } from '../config/services.js';
import { existsSync } from 'fs';
import { getDeerFlowPath } from '../utils/env.js';
import { getPackageVersion } from '../utils/version.js';

/**
 * 获取日志目录路径
 * Get log directory path
 * 
 * 日志目录在 DeerFlow 项目目录下的 logs 文件夹
 * Log directory is the logs folder under DeerFlow project directory
 */
function getLogDir(): string {
  const deerflowPath = getDeerFlowPath();
  return join(deerflowPath, 'logs');
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
    const filter: { service: ServiceName | 'launcher'; lines?: number; level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' } = { service };
    if (options?.lines) filter.lines = options.lines;
    if (options?.level) filter.level = options.level.toUpperCase() as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

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

  async init(): Promise<void> {
    const deerflowPath = getDeerFlowPath();
    const logDir = getLogDir();
    const configInitializer = new ConfigInitializer(deerflowPath, logDir);
    if (!configInitializer.validateDeerFlowPath()) {
      throw new Error(
        'Invalid DeerFlow path. Ensure the repository is properly cloned and config.example.yaml exists.'
      );
    }
    const result = await configInitializer.initialize();
    if (!result.success) {
      throw new Error(`Failed to initialize config files: ${result.failed.join(', ')}`);
    }
  }
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
    this.processManager = new ProcessManager(this.logDir, getDeerFlowPath());
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
    const deerflowPath = getDeerFlowPath();
    
    const configInitializer = new ConfigInitializer(deerflowPath, this.logDir);
    if (!configInitializer.validateDeerFlowPath()) {
      throw new CLIError(
        ErrorCode.CONFIG_INVALID,
        'Invalid DeerFlow path',
        { suggestion: 'Please ensure DeerFlow repository is properly cloned and config.example.yaml exists' }
      );
    }
    
    const initResult = await configInitializer.initialize();
    if (!initResult.success) {
      throw new CLIError(
        ErrorCode.CONFIG_PARSE_ERROR,
        `Failed to initialize config files: ${initResult.failed.join(', ')}`,
        { suggestion: 'Check if template files exist and you have write permissions' }
      );
    }
    
    if (initResult.created.length > 0) {
      this.logger.info(`Created config files: ${initResult.created.join(', ')}`);
    }

    try {
      await this.processManager.connect();
    } catch (error) {
      this.logger.error(`Failed to connect to process manager: ${error}`);
      throw error;
    }
    
    const services = options?.only 
      ? SERVICE_START_ORDER.filter((s): s is ServiceName => options.only?.includes(s) ?? false)
      : SERVICE_START_ORDER;

    const serviceDefs = getServiceDefinitions(deerflowPath, { langsmith: options?.langsmith });
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
      ? SERVICE_START_ORDER.filter((s): s is ServiceName => options.only?.includes(s) ?? false)
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
    .version(getPackageVersion(), '-v, --version');

  program.exitOverride();

  function isPm2SocketError(err: { message?: string; code?: string }): boolean {
    return err?.code === 'ECONNREFUSED' &&
      Boolean(err?.message?.includes('.sock') || err?.message?.includes('pm2'));
  }

  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason as { message?: string; code?: string };
    if (isPm2SocketError(err)) {
      if (process.env.DEBUG) {
        console.debug('[debug] Suppressed PM2 socket error:', err?.message);
      }
      return;
    }
    console.error(chalk.red('\nUnexpected error:'), reason);
    process.exit(ErrorCode.UNKNOWN_ERROR);
  });

  process.on('uncaughtException', (error: unknown) => {
    const err = error as { message?: string; code?: string };
    if (isPm2SocketError(err)) {
      if (process.env.DEBUG) {
        console.debug('[debug] Suppressed PM2 socket error:', err?.message);
      }
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
  registerDemoCommand(program);

  return program;
}

export async function runCLI(): Promise<void> {
  try {
    const program = await createCLI();
    await program.parseAsync(process.argv);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === 'commander.help' || err?.code === 'commander.helpDisplayed' || err?.code === 'commander.version') {
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
