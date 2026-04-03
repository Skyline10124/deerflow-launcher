import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import { join } from 'path';
import {
  registerServiceCommands,
  registerLogsCommands,
  registerConfigCommands,
  registerDoctorCommands,
  registerDashboardCommand
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
import { getDeerFlowPath, getDeerFlowPathWithInstanceId, clearCache } from '../utils/env.js';
import { getPackageVersion } from '../utils/version.js';

let globalDeerFlowPath: string | undefined;
let globalUsePath: string | undefined;

export function setGlobalDeerFlowPath(path: string | undefined): void {
  globalDeerFlowPath = path;
  clearCache();
}

export function setGlobalUsePath(name: string | undefined): void {
  globalUsePath = name;
  clearCache();
}

function getLogDir(): string {
  const deerflowPath = getDeerFlowPath({
    cliPath: globalDeerFlowPath,
    usePath: globalUsePath,
  });
  return join(deerflowPath, 'logs');
}

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

class ConfigServiceAdapter implements IConfigService {
  async get(key: string): Promise<unknown> {
    switch (key) {
      case 'deerflowPath':
        return getDeerFlowPath({
          cliPath: globalDeerFlowPath,
          usePath: globalUsePath,
        });
      case 'logDir':
        return getLogDir();
      case 'services':
        return SERVICE_START_ORDER;
      default:
        return undefined;
    }
  }

  async set(key: string, _value: unknown): Promise<void> {
    throw new CLIError(
      ErrorCode.CONFIG_PARSE_ERROR,
      `Use "config set ${key}" command to modify configuration`
    );
  }

  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (!existsSync(getDeerFlowPath({
      cliPath: globalDeerFlowPath,
      usePath: globalUsePath,
    }))) {
      errors.push('DeerFlow path does not exist');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  async init(): Promise<void> {
    const deerflowPath = getDeerFlowPath({
      cliPath: globalDeerFlowPath,
      usePath: globalUsePath,
    });
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

class ServiceManagerAdapter implements IServiceManager {
  private processManager: ProcessManager;
  private processMonitor: ProcessMonitor;
  private logService: LogServiceAdapter;
  private configService: ConfigServiceAdapter;
  private logDir: string;
  private logger: Logger;
  private instanceId: string;

  constructor() {
    const { path: deerflowPath, instanceId } = getDeerFlowPathWithInstanceId({
      cliPath: globalDeerFlowPath,
      usePath: globalUsePath,
    });
    this.instanceId = instanceId;
    this.logDir = join(deerflowPath, 'logs');
    this.logger = new Logger('CLI', { logDir: this.logDir });
    setDefaultLogger(this.logger);
    this.processManager = new ProcessManager(this.logDir, deerflowPath, instanceId);
    this.processMonitor = new ProcessMonitor({}, instanceId);
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
    const deerflowPath = getDeerFlowPath({
      cliPath: globalDeerFlowPath,
      usePath: globalUsePath,
    });
    
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
    .version(getPackageVersion(), '-v, --version')
    .option('-d, --deerflow-path <path>', 'DeerFlow project path')
    .option('-p, --use-path <name>', 'Use a configured path by name');

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
  registerDashboardCommand(program);

  return program;
}

export async function runCLI(): Promise<void> {
  try {
    const program = await createCLI();
    
    program.hook('preAction', (thisCommand) => {
      const options = thisCommand.opts();
      if (options.deerflowPath) {
        setGlobalDeerFlowPath(options.deerflowPath);
      }
      if (options.usePath) {
        setGlobalUsePath(options.usePath);
      }
    });
    
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
