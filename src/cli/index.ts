import { Command } from 'commander';
import chalk from 'chalk';
import {
  registerServiceCommands,
  registerLogsCommands,
  registerConfigCommands,
  registerDoctorCommands
} from './commands';
import { CLIError, ErrorCode } from './utils/errors';
import type { IServiceManager, ServiceStatusInfo, ILogService, IConfigService } from '../core/interfaces/IServiceManager';
import type { ServiceName, ServiceInstance } from '../types';
import { ServiceStatus } from '../types';
import { ProcessManager } from '../modules/ProcessManager';
import { ProcessMonitor, ProcessStatus } from '../modules/ProcessMonitor';
import { LogManager } from '../modules/LogManager';
import { Logger, getLogger, setDefaultLogger } from '../modules/Logger';
import { EnvDoctor } from '../modules/EnvDoctor';
import { SERVICE_START_ORDER, SERVICE_PORTS, getServiceDefinitions } from '../config/services';
import { readFileSync, readdirSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';

function getDeerFlowPath(): string {
  const envPath = process.env.DEERFLOW_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }
  return process.cwd();
}

function getLogDir(): string {
  return join(getDeerFlowPath(), 'logs');
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
      const content = readFileSync(logFile, 'utf-8');
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

  async clearLogs(service: ServiceName | 'launcher'): Promise<void> {
    const logFile = this.logManager.getLogFilePath(service);
    try {
      unlinkSync(logFile);
    } catch {}
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
  }): Promise<void> {
    await this.processManager.connect();
    
    const services = options?.only 
      ? SERVICE_START_ORDER.filter((s): s is ServiceName => options.only!.includes(s))
      : SERVICE_START_ORDER;

    const serviceDefs = getServiceDefinitions(getDeerFlowPath());
    const dependencies = new Map<ServiceName, ServiceInstance>();
    
    for (const name of services) {
      const def = serviceDefs.find(d => d.name === name);
      if (def) {
        await this.processManager.startService(def, dependencies);
        dependencies.set(name, { 
          name, 
          port: def.port, 
          status: ServiceStatus.HEALTHY 
        });
      }
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

    await this.processManager.disconnect();
  }

  async restart(services?: ServiceName[]): Promise<void> {
    await this.stop({ only: services });
    await new Promise(r => setTimeout(r, 1000));
    await this.start({ only: services });
  }

  async getStatus(service?: ServiceName): Promise<ServiceStatusInfo | ServiceStatusInfo[]> {
    await this.processMonitor.connect();
    
    const statuses = await this.processMonitor.getStatus();
    await this.processMonitor.disconnect();
    
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
    await this.processMonitor.disconnect();
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
    
    return {
      name: status.name as ServiceName,
      status: mappedStatus,
      cpu: `${status.cpu}%`,
      memory: `${Math.round(status.memory / 1024 / 1024)} MB`,
      pid: status.pid,
      uptime: status.uptime ? `${Math.floor(status.uptime / 60)}m` : undefined,
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
    .version('0.3.0');

  program.exitOverride();

  process.on('unhandledRejection', (reason) => {
    console.error(chalk.red('\nUnexpected error:'), reason);
    process.exit(ErrorCode.UNKNOWN_ERROR);
  });

  process.on('uncaughtException', (error) => {
    console.error(chalk.red('\nUnexpected error:'), error);
    process.exit(ErrorCode.UNKNOWN_ERROR);
  });

  const services = new ServiceManagerAdapter();

  registerServiceCommands(program, services);
  registerLogsCommands(program, services);
  registerConfigCommands(program, services);
  registerDoctorCommands(program, services);

  program
    .command('start [services...]')
    .description('Start DeerFlow services (shortcut)')
    .option('-w, --watch', 'Watch configuration files', false)
    .option('-d, --detach', 'Run in background', false)
    .action(async (serviceNames, options) => {
      const spinner = require('ora')({ text: 'Starting services...', spinner: 'dots' }).start();
      try {
        await services.start({
          only: serviceNames.length > 0 ? serviceNames : undefined,
          watch: options.watch,
          detached: options.detach
        });
        spinner.succeed(chalk.green('Services started'));
        const statuses = await services.getAllStatus();
        console.log('\n' + require('./components/ServiceTable').formatServiceTable(statuses));
      } catch (error) {
        spinner.fail();
        throw error;
      }
    });

  program
    .command('stop [services...]')
    .description('Stop DeerFlow services (shortcut)')
    .option('-f, --force', 'Force stop', false)
    .action(async (serviceNames, options) => {
      const spinner = require('ora')({ text: 'Stopping services...', spinner: 'dots' }).start();
      try {
        await services.stop({
          only: serviceNames.length > 0 ? serviceNames : undefined,
          force: options.force
        });
        spinner.succeed(chalk.green('Services stopped'));
      } catch (error) {
        spinner.fail();
        throw error;
      }
    });

  program
    .command('status [service]')
    .description('Show service status (shortcut)')
    .option('-j, --json', 'Output as JSON', false)
    .action(async (serviceName, options) => {
      const statuses = serviceName 
        ? [await services.getStatus(serviceName)]
        : await services.getAllStatus();
      
      if (options.json) {
        console.log(JSON.stringify(statuses, null, 2));
      } else {
        console.log(require('./components/ServiceTable').formatServiceTable(
          Array.isArray(statuses) ? statuses : [statuses]
        ));
      }
    });

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
