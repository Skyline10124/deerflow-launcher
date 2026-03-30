#!/usr/bin/env node
import * as path from 'path';
import * as fs from 'fs';
import {
  ProcessMonitor,
  EnvDoctor,
  LogManager,
  ProcessManager,
  getLogger,
  setDefaultLogger,
  Logger,
  LogLevel
} from './modules';
import { ServiceName } from './types';

export interface CLIOptions {
  deerflowPath: string;
  logDir: string;
  json?: boolean;
}

export class CLI {
  private deerflowPath: string;
  private logDir: string;
  private json: boolean;
  private processMonitor: ProcessMonitor;
  private processManager: ProcessManager;
  private logManager: LogManager;

  constructor(options: CLIOptions) {
    this.deerflowPath = options.deerflowPath;
    this.logDir = options.logDir;
    this.json = options.json || false;

    const logger = new Logger('CLI', { logDir: this.logDir });
    setDefaultLogger(logger);

    this.processMonitor = new ProcessMonitor();
    this.processManager = new ProcessManager(this.logDir);
    this.logManager = new LogManager(this.logDir);
  }

  async status(): Promise<void> {
    try {
      await this.processMonitor.connect();
      const statuses = await this.processMonitor.getStatus();
      await this.processMonitor.disconnect();

      if (this.json) {
        console.log(JSON.stringify(statuses, null, 2));
      } else {
        console.log(this.processMonitor.formatStatusTable(statuses));
      }
    } catch (error) {
      console.error('Failed to get status:', error);
      process.exit(1);
    }
  }

  async doctor(): Promise<void> {
    const doctor = new EnvDoctor(this.deerflowPath);
    const report = await doctor.diagnose();

    if (this.json) {
      console.log(doctor.toJSON(report));
    } else {
      console.log(doctor.formatReport(report));
    }

    if (!report.success) {
      process.exit(1);
    }
  }

  async logs(service: ServiceName | 'launcher', lines: number = 20, follow: boolean = false): Promise<void> {
    if (follow) {
      console.log(`Following ${service} logs (Ctrl+C to stop)...\n`);
      
      const stopFollowing = this.logManager.follow(service, (entry) => {
        console.log(entry.raw);
      });

      process.on('SIGINT', () => {
        stopFollowing();
        process.exit(0);
      });

      await new Promise(() => {});
    } else {
      this.logManager.printTail(service, lines);
    }
  }

  async restart(service: ServiceName): Promise<void> {
    try {
      await this.processManager.connect();
      await this.processManager.stopService(service);
      
      console.log(`Restarting ${service}...`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`${service} stopped. Use 'start' command to start it again.`);
      await this.processManager.disconnect();
    } catch (error) {
      console.error(`Failed to restart ${service}:`, error);
      process.exit(1);
    }
  }

  async stop(service?: ServiceName): Promise<void> {
    try {
      await this.processManager.connect();
      
      if (service) {
        await this.processManager.stopService(service);
        console.log(`Stopped ${service}`);
      } else {
        await this.processManager.killAllManagedProcesses();
        console.log('Stopped all services');
      }
      
      await this.processManager.disconnect();
    } catch (error) {
      console.error('Failed to stop services:', error);
      process.exit(1);
    }
  }

  async clean(): Promise<void> {
    try {
      await this.processManager.connect();
      await this.processManager.killAllManagedProcesses();
      await this.processManager.disconnect();
      
      console.log('All managed processes cleaned up.');
    } catch (error) {
      console.error('Failed to clean processes:', error);
      process.exit(1);
    }
  }

  printHelp(): void {
    console.log(`
DeerFlow Launcher CLI

Usage:
  deerflow-launcher <command> [options]

Commands:
  status              Show status of all services
  doctor              Run environment diagnostics
  logs <service>      Show logs for a service (langgraph, gateway, frontend, nginx, launcher)
    --lines <n>       Number of lines to show (default: 20)
    --follow, -f      Follow log output
  restart <service>   Restart a specific service
  stop [service]      Stop a service or all services
  clean               Kill all managed processes
  help                Show this help message

Options:
  --json              Output in JSON format
  --debug             Enable debug logging

Examples:
  deerflow-launcher status
  deerflow-launcher doctor
  deerflow-launcher logs langgraph --lines 50
  deerflow-launcher logs frontend --follow
  deerflow-launcher restart gateway
  deerflow-launcher stop
`);
  }
}

export async function runCLI(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    const cli = new CLI({ deerflowPath: process.cwd(), logDir: path.join(process.cwd(), 'logs') });
    cli.printHelp();
    process.exit(0);
  }

  const command = args[0];
  const options: CLIOptions = {
    deerflowPath: getDeerFlowPath(),
    logDir: path.join(process.cwd(), 'logs'),
    json: args.includes('--json')
  };

  const cli = new CLI(options);

  switch (command) {
    case 'status':
      await cli.status();
      break;
    
    case 'doctor':
      await cli.doctor();
      break;
    
    case 'logs': {
      const serviceArg = args[1];
      if (!serviceArg) {
        console.error('Error: Service name required');
        console.log('Available services: langgraph, gateway, frontend, nginx, launcher');
        process.exit(1);
      }
      
      const linesIndex = args.indexOf('--lines');
      const lines = linesIndex > -1 ? parseInt(args[linesIndex + 1], 10) || 20 : 20;
      const follow = args.includes('--follow') || args.includes('-f');
      
      await cli.logs(serviceArg as ServiceName | 'launcher', lines, follow);
      break;
    }
    
    case 'restart': {
      const serviceArg = args[1];
      if (!serviceArg) {
        console.error('Error: Service name required');
        process.exit(1);
      }
      await cli.restart(serviceArg as ServiceName);
      break;
    }
    
    case 'stop': {
      const serviceArg = args[1];
      await cli.stop(serviceArg as ServiceName | undefined);
      break;
    }
    
    case 'clean':
      await cli.clean();
      break;
    
    default:
      console.error(`Unknown command: ${command}`);
      console.log("Run 'deerflow-launcher help' for usage information.");
      process.exit(1);
  }
}

function getDeerFlowPath(): string {
  const envPath = process.env.DEERFLOW_PATH;
  if (envPath) {
    if (!fs.existsSync(envPath)) {
      console.error(`Error: DEERFLOW_PATH points to non-existent path: ${envPath}`);
      process.exit(1);
    }
    return envPath;
  }

  let currentPath = process.cwd();
  
  while (currentPath !== path.dirname(currentPath)) {
    const configYaml = path.join(currentPath, 'config.example.yaml');
    if (fs.existsSync(configYaml)) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }

  return process.cwd();
}
