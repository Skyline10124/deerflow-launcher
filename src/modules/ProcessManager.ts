import * as path from 'path';
import * as fs from 'fs';
import { Logger, getLogger } from './Logger';
import { HealthChecker } from './HealthChecker';
import {
  ServiceDefinition,
  ServiceInstance,
  ServiceStatus,
  ServiceName
} from '../types';

const MANAGED_SERVICE_NAMES: readonly ServiceName[] = Object.values(ServiceName);

export interface ProcessConfig {
  name: string;
  script: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
  out_file?: string;
  error_file?: string;
}

interface ManagedProcess {
  name: string;
  process: ReturnType<typeof Bun.spawn> | null;
  pid: number | null;
  status: 'running' | 'stopped' | 'crashed';
  startTime: Date;
}

export class ProcessManager {
  private logger: Logger;
  private healthChecker: HealthChecker;
  private connected: boolean = false;
  private logDir: string;
  private processes: Map<string, ManagedProcess> = new Map();
  private instanceId: string;
  private pm2Home: string;

  constructor(logDir: string) {
    this.logger = getLogger('ProcessMgr');
    this.healthChecker = new HealthChecker();
    this.logDir = logDir;
    this.instanceId = 'default';
    this.pm2Home = this.resolvePm2Home();
    this.ensurePm2Home();
  }

  private resolvePm2Home(): string {
    const baseDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.deerflow');
    return path.join(baseDir, 'pm2-instances', this.instanceId);
  }

  private ensurePm2Home(): void {
    if (!fs.existsSync(this.pm2Home)) {
      fs.mkdirSync(this.pm2Home, { recursive: true });
    }
    const logDir = path.join(this.pm2Home, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      this.connected = true;
      this.logger.debug('Process manager initialized (Bun native)');
      await this.cleanupStaleProcesses();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize process manager: ${errorMsg}`);
      throw new Error(`Process manager initialization failed: ${errorMsg}`);
    }
  }

  private async cleanupStaleProcesses(): Promise<void> {
    const pidFile = path.join(this.pm2Home, 'pids.json');
    if (!fs.existsSync(pidFile)) {
      return;
    }

    try {
      const data = fs.readFileSync(pidFile, 'utf-8');
      const pids: Record<string, { pid: number; logDir: string }> = JSON.parse(data);
      
      for (const [name, info] of Object.entries(pids)) {
        if (info.logDir !== this.logDir) {
          this.logger.debug(`Cleaning stale process: ${name}`);
          try {
            process.kill(info.pid, 'SIGTERM');
          } catch {
            // Process may already be dead
          }
        }
      }
    } catch {
      // Ignore errors during cleanup
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    this.connected = false;
    this.logger.debug('Process manager disconnected');
  }

  forceDisconnect(): void {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private buildProcessConfig(service: ServiceDefinition): ProcessConfig {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    const logFile = path.join(this.logDir, `${service.name}.log`);

    return {
      name: service.name,
      script: service.script,
      args: service.args || [],
      cwd: service.cwd,
      env: service.env,
      out_file: logFile,
      error_file: logFile
    };
  }

  async startService(
    service: ServiceDefinition,
    dependencies: Map<ServiceName, ServiceInstance>
  ): Promise<ServiceInstance> {
    this.logger.info(`Starting ${service.name} service...`);

    if (service.dependencies) {
      for (const depName of service.dependencies) {
        const dep = dependencies.get(depName);
        if (!dep || dep.status !== ServiceStatus.HEALTHY) {
          throw new Error(`Dependency ${depName} is not ready`);
        }
      }
    }

    const instance: ServiceInstance = {
      name: service.name,
      status: ServiceStatus.STARTING,
      port: service.port,
      startTime: new Date()
    };

    try {
      await this.stopExistingProcess(service.name);

      const config = this.buildProcessConfig(service);
      const proc = await this.spawnProcess(config);

      if (proc.pid) {
        instance.pid = proc.pid;
      }

      this.logger.debug(`${service.name} process started (pid: ${proc.pid}), waiting for health check...`);

      const healthResult = await this.healthChecker.check({
        host: 'localhost',
        port: service.port,
        timeout: service.timeout,
        interval: 1000
      });

      if (healthResult.status === 'healthy') {
        instance.status = ServiceStatus.HEALTHY;
        instance.healthCheckDuration = healthResult.duration;
        this.logger.success(`${service.name} is ready`);
      } else {
        instance.status = ServiceStatus.FAILED;
        instance.error = healthResult.error || 'Health check failed';
        
        const logError = await this.detectConfigError(service.name);
        if (logError) {
          instance.error = logError;
          this.logger.error(`${service.name} configuration error detected`);
          this.logger.error(logError);
        }
        
        throw new Error(`${service.name} failed to start: ${instance.error}`);
      }
    } catch (error) {
      instance.status = ServiceStatus.FAILED;
      instance.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start ${service.name}: ${instance.error}`);
      throw error;
    }

    return instance;
  }

  async startServiceDetached(
    service: ServiceDefinition,
    dependencies: Map<ServiceName, ServiceInstance>
  ): Promise<ServiceInstance> {
    this.logger.info(`Starting ${service.name} service (detached)...`);

    if (service.dependencies) {
      for (const depName of service.dependencies) {
        const dep = dependencies.get(depName);
        if (!dep || (dep.status !== ServiceStatus.HEALTHY && dep.status !== ServiceStatus.STARTING)) {
          throw new Error(`Dependency ${depName} is not ready`);
        }
      }
    }

    const instance: ServiceInstance = {
      name: service.name,
      status: ServiceStatus.STARTING,
      port: service.port,
      startTime: new Date()
    };

    try {
      await this.stopExistingProcess(service.name);

      const config = this.buildProcessConfig(service);
      await this.spawnProcess(config);

      this.logger.info(`${service.name} started in background`);
    } catch (error) {
      instance.status = ServiceStatus.FAILED;
      instance.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start ${service.name}: ${instance.error}`);
      throw error;
    }

    return instance;
  }

  private async spawnProcess(config: ProcessConfig): Promise<ReturnType<typeof Bun.spawn>> {
    const logFilePath = config.out_file || path.join(this.logDir, `${config.name}.log`);
    
    const logFile = Bun.file(logFilePath);
    const writer = logFile.writer();
    
    const isWindows = process.platform === 'win32';
    const command = config.script;
    const args = config.args || [];

    const proc = Bun.spawn([command, ...args], {
      cwd: config.cwd,
      env: { ...process.env, ...config.env },
      stdout: 'pipe',
      stderr: 'pipe',
      detached: !isWindows,
      windowsHide: true,
      onExit: (proc, exitCode, signalCode) => {
        this.logger.debug(`Process ${config.name} exited with code ${exitCode}, signal ${signalCode}`);
        const managed = this.processes.get(config.name);
        if (managed) {
          managed.status = 'crashed';
          managed.process = null;
        }
        writer.end();
      }
    });

    const stdoutReader = proc.stdout.getReader();
    const stderrReader = proc.stderr.getReader();
    
    const pumpOutput = async (reader: ReadableStreamDefaultReader) => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          writer.write(value as Uint8Array);
          writer.flush();
        }
      } catch {
        // Stream closed
      }
    };
    
    pumpOutput(stdoutReader as ReadableStreamDefaultReader);
    pumpOutput(stderrReader as ReadableStreamDefaultReader);

    this.processes.set(config.name, {
      name: config.name,
      process: proc,
      pid: proc.pid,
      status: 'running',
      startTime: new Date()
    });

    await this.savePidFile();

    return proc;
  }

  private async savePidFile(): Promise<void> {
    const pidFile = path.join(this.pm2Home, 'pids.json');
    const pids: Record<string, { pid: number; logDir: string }> = {};

    for (const [name, proc] of this.processes) {
      if (proc.pid) {
        pids[name] = {
          pid: proc.pid,
          logDir: this.logDir
        };
      }
    }

    fs.writeFileSync(pidFile, JSON.stringify(pids, null, 2));
  }

  async stopService(name: ServiceName): Promise<void> {
    this.logger.info(`Stopping ${name} service...`);

    const managed = this.processes.get(name);
    if (!managed || !managed.process) {
      this.logger.info(`${name} is not running`);
      return;
    }

    try {
      managed.process.kill('SIGTERM');
      
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (managed.process) {
            try {
              managed.process.kill('SIGKILL');
            } catch {
              // Process already dead
            }
          }
          resolve();
        }, 3000);
      });

      this.processes.delete(name);
      await this.savePidFile();
      this.logger.info(`Stopped ${name}`);
    } catch (error) {
      this.logger.warn(`Error stopping ${name}: ${error}, continuing...`);
    }
  }

  private async stopExistingProcess(name: string): Promise<void> {
    const managed = this.processes.get(name);
    if (managed && managed.process) {
      this.logger.debug(`Stopping existing process: ${name}`);
      try {
        managed.process.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch {
        // Process may already be dead
      }
      this.processes.delete(name);
    }
  }

  async killAllManagedProcesses(): Promise<void> {
    this.logger.info('Killing all managed processes...');
    
    const killPromises = Array.from(this.processes.entries()).map(async ([name, managed]) => {
      if ((MANAGED_SERVICE_NAMES as readonly string[]).includes(name)) {
        this.logger.debug(`Killing process: ${name}`);
        try {
          if (managed.process) {
            managed.process.kill('SIGKILL');
          }
        } catch {
          // Ignore errors
        }
      }
    });

    await Promise.all(killPromises);
    this.processes.clear();
    await this.savePidFile();
  }

  async stopAll(services: Map<ServiceName, ServiceInstance>): Promise<void> {
    this.logger.info('Stopping all services...');
    
    const serviceNames = Array.from(services.keys()).reverse();
    
    for (const serviceName of serviceNames) {
      await this.stopService(serviceName);
    }
    
    this.logger.info('All services stopped');
  }

  async listProcesses(): Promise<Array<{ name: string; pid: number | null; status: string }>> {
    return Array.from(this.processes.entries()).map(([name, proc]) => ({
      name,
      pid: proc.pid,
      status: proc.status
    }));
  }

  getProcess(name: string): ManagedProcess | undefined {
    return this.processes.get(name);
  }

  private async detectConfigError(serviceName: string): Promise<string | null> {
    const logFile = path.join(this.logDir, `${serviceName}.log`);
    
    if (!fs.existsSync(logFile)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.split('\n').slice(-100).join('\n');
      
      if (lines.includes('ValidationError') && lines.includes('AppConfig')) {
        const modelMatch = lines.match(/(\w+)\s+Input should be a valid list/);
        const fieldMatch = lines.match(/for\s+(\w+)\s*\n/);
        
        const field = fieldMatch ? fieldMatch[1] : (modelMatch ? modelMatch[1] : 'unknown');
        
        return (
          `Configuration validation error in config.yaml:\n` +
          `  Field '${field}' is invalid or missing.\n` +
          `  Please check your config.yaml file and ensure all required fields are set.\n` +
          `  Run 'deerflow-launcher config show' to view current configuration.`
        );
      }
      
      if (lines.includes('FileNotFoundError') && lines.includes('config.yaml')) {
        return (
          `Configuration file not found.\n` +
          `  Please ensure config.yaml exists in the DeerFlow directory.\n` +
          `  Run 'deerflow-launcher config init' to create it from template.`
        );
      }
      
      if (lines.includes('WinError 10013')) {
        return (
          `Port is already in use or access denied.\n` +
          `  Another process may be using the required port.\n` +
          `  Try stopping all services with 'deerflow-launcher svc stop' and restart.`
        );
      }
      
      return null;
    } catch {
      return null;
    }
  }

  getPm2Home(): string {
    return this.pm2Home;
  }

  getPidFile(): string {
    return path.join(this.pm2Home, 'pm2.pid');
  }

  getLogDir(): string {
    return this.logDir;
  }

  static listInstances(): string[] {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    const baseDir = path.join(homeDir, '.deerflow', 'pm2-instances');
    if (!fs.existsSync(baseDir)) {
      return [];
    }
    return fs.readdirSync(baseDir).filter(name => {
      const instanceDir = path.join(baseDir, name);
      return fs.statSync(instanceDir).isDirectory();
    });
  }

  static removeInstance(instanceId: string): boolean {
    if (!instanceId || /[/\\]/.test(instanceId) || instanceId.includes('..')) {
      throw new Error(`Invalid instance ID: "${instanceId}"`);
    }
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    const expectedParent = path.resolve(homeDir, '.deerflow', 'pm2-instances');
    const baseDir = path.resolve(expectedParent, instanceId);
    if (!baseDir.startsWith(expectedParent + path.sep)) {
      throw new Error('Invalid instance ID: resolved path escapes expected directory');
    }
    if (fs.existsSync(baseDir)) {
      fs.rmSync(baseDir, { recursive: true, force: true });
      return true;
    }
    return false;
  }
}
