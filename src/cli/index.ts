import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import { dirname, join, resolve } from 'path';
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
import { Logger, getLogger, setDefaultLogger } from '../modules/Logger';
import { EnvDoctor } from '../modules/EnvDoctor';
import { SERVICE_START_ORDER, SERVICE_PORTS, getServiceDefinitions } from '../config/services';
import { readFileSync, readdirSync, unlinkSync, existsSync } from 'fs';

function findDeerFlowRoot(): string {
  const envPath = process.env.DEERFLOW_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  let currentPath = process.cwd();
  
  while (currentPath !== dirname(currentPath)) {
    if (existsSync(join(currentPath, 'backend')) && 
        existsSync(join(currentPath, 'frontend'))) {
      return currentPath;
    }
    currentPath = dirname(currentPath);
  }

  const parentDir = dirname(process.cwd());
  if (existsSync(join(parentDir, 'backend')) && 
      existsSync(join(parentDir, 'frontend'))) {
    return parentDir;
  }

  return process.cwd();
}

function getDeerFlowPath(): string {
  return findDeerFlowRoot();
}

function getLogDir(): string {
  const cliDir = __dirname;
  const launcherDir = dirname(dirname(dirname(cliDir)));
  return join(launcherDir, 'logs');
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
    const lines = options?.lines || 50;
    const logFile = this.logManager.getLogFilePath(service);
    
    try {
      const content = fs.readFileSync(logFile, 'utf-8');
      const allLines = content.split('\n').filter(l => l.trim());
      
      if (options?.level) {
        const level = options.level.toUpperCase();
        return allLines
          .filter(l => l.includes(`[${level}]`))
          .slice(-lines);
      }
      
      return allLines.slice(-lines);
    } catch {
      return [];
    }
  }

  watchLogs(service: ServiceName | 'launcher', callback: (line: string) => void): () => void {
    const logFile = this.logManager.getLogFilePath(service);
    
    if (!fs.existsSync(logFile)) {
      return () => {};
    }

    let lastSize = fs.statSync(logFile).size;
    let lastLineCount = fs.readFileSync(logFile, 'utf-8').split('\n').filter(l => l.trim()).length;

    const timer = setInterval(() => {
      try {
        if (!fs.existsSync(logFile)) return;
        
        const stats = fs.statSync(logFile);
        if (stats.size !== lastSize) {
          const content = fs.readFileSync(logFile, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim());
          
          for (let i = lastLineCount; i < lines.length; i++) {
            callback(lines[i]);
          }
          
          lastLineCount = lines.length;
          lastSize = stats.size;
        }
      } catch {}
    }, 200);

    return () => clearInterval(timer);
  }

  async clearLogs(service: ServiceName | 'launcher'): Promise<void> {
    const logFile = this.logManager.getLogFilePath(service);
    try {
      fs.writeFileSync(logFile, '');
    } catch {}
  }

  async clearAllLogs(): Promise<void> {
    const services: (ServiceName | 'launcher')[] = [
      'launcher',
      ServiceName.LANGGRAPH,
      ServiceName.GATEWAY,
      ServiceName.FRONTEND,
      ServiceName.NGINX
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
    await this.processManager.connect();
    
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
    await this.processManager.connect();
    
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
    await this.processMonitor.connect();
    
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
    await this.processMonitor.connect();
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

  private toStatusInfo(status: ProcessStatus): ServiceStatusInfo {
    const mappedStatus: ServiceStatusInfo['status'] = 
      status.status === 'stopped' || status.status === 'unknown' ? 'offline' 
      : status.status === 'launching' ? 'launching'
      : status.status === 'errored' ? 'errored'
      : status.status === 'online' ? 'online'
      : 'offline';
    
    const uptimeMs = status.uptime;
    let uptimeStr: string | undefined;
    if (uptimeMs) {
      const totalSeconds = Math.floor(uptimeMs / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      
      if (days > 0) {
        uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
      } else if (hours > 0) {
        uptimeStr = `${hours}h ${minutes}m ${seconds}s`;
      } else if (minutes > 0) {
        uptimeStr = `${minutes}m ${seconds}s`;
      } else {
        uptimeStr = `${seconds}s`;
      }
    }
    
    return {
      name: status.name as ServiceName,
      status: mappedStatus,
      cpu: `${status.cpu}%`,
      memory: `${Math.round(status.memory / 1024 / 1024)} MB`,
      pid: status.pid,
      uptime: uptimeStr,
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
