import * as path from 'path';
import * as fs from 'fs';
import PM2 from 'pm2';
import { Logger, getLogger } from './Logger';
import { HealthChecker } from './HealthChecker';
import {
  ServiceDefinition,
  ServiceInstance,
  ServiceStatus,
  ServiceName,
  ErrorCodes
} from '../types';

export interface PM2ProcessConfig {
  name: string;
  script: string;
  args?: string[];
  cwd: string;
  interpreter?: string;
  exec_mode?: string;
  instances?: number;
  autorestart?: boolean;
  max_restarts?: number;
  min_uptime?: number;
  log_file?: string;
  out_file?: string;
  error_file?: string;
  merge_logs?: boolean;
  time?: boolean;
  env?: Record<string, string>;
}

export class ProcessManager {
  private logger: Logger;
  private healthChecker: HealthChecker;
  private connected: boolean = false;
  private logDir: string;

  constructor(logDir: string) {
    this.logger = getLogger('ProcessMgr');
    this.healthChecker = new HealthChecker();
    this.logDir = logDir;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        PM2.connect((err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            this.connected = true;
            this.logger.debug('Connected to PM2');
            resolve();
          }
        });
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to connect to PM2: ${errorMsg}`);
      throw new Error(`PM2 connection failed: ${errorMsg}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    return new Promise<void>((resolve) => {
      try {
        PM2.disconnect();
        this.connected = false;
        this.logger.debug('Disconnected from PM2');
      } catch (error) {
        this.logger.warn('Error during PM2 disconnect');
      }
      resolve();
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  private buildPM2Config(service: ServiceDefinition): PM2ProcessConfig {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    const isNodeScript = service.script.endsWith('.js') || 
                         service.script.endsWith('.ts') ||
                         service.script.endsWith('.mjs');
    
    const isWindows = process.platform === 'win32';
    
    let script = service.script;
    let args = service.args || [];
    let interpreter: string | undefined;
    
    if (isNodeScript) {
      interpreter = undefined;
    } else if (isWindows) {
      script = 'cmd.exe';
      const fullCommand = service.args && service.args.length > 0
        ? `${service.script} ${service.args.join(' ')}`
        : service.script;
      args = ['/c', fullCommand];
      interpreter = undefined;
    } else {
      interpreter = 'none';
    }
    
    const config: PM2ProcessConfig = {
      name: service.name,
      script: script,
      args: args,
      cwd: service.cwd,
      interpreter: interpreter,
      exec_mode: 'fork',
      instances: 1,
      autorestart: false,
      max_restarts: 0,
      min_uptime: 10000,
      log_file: path.join(this.logDir, `${service.name}.log`),
      out_file: path.join(this.logDir, `${service.name}-out.log`),
      error_file: path.join(this.logDir, `${service.name}-error.log`),
      merge_logs: false,
      time: true,
      env: service.env
    };

    return config;
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
      const config = this.buildPM2Config(service);

      const proc = await new Promise<any>((resolve, reject) => {
        PM2.start(config, (err: Error | null, proc: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(proc);
          }
        });
      });

      if (proc && proc[0]) {
        instance.pid = proc[0].pm2_env?.pm_id;
      }

      this.logger.debug(`${service.name} process started, waiting for health check...`);

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

  async stopService(name: ServiceName): Promise<void> {
    if (!this.connected) {
      this.logger.warn(`PM2 not connected, cannot stop ${name}`);
      return;
    }

    this.logger.info(`Stopping ${name} service...`);

    try {
      await new Promise<void>((resolve, reject) => {
        PM2.stop(name, (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      await new Promise<void>((resolve, reject) => {
        PM2.delete(name, (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      this.logger.info(`Stopped ${name}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to stop ${name}: ${errorMsg}`);
    }
  }

  async stopAll(services: Map<ServiceName, ServiceInstance>): Promise<void> {
    this.logger.info('Stopping all services...');

    for (const [name, instance] of services) {
      if (instance.status === ServiceStatus.HEALTHY || 
          instance.status === ServiceStatus.STARTING) {
        await this.stopService(name);
      }
    }
  }

  async listProcesses(): Promise<any[]> {
    if (!this.connected) {
      return [];
    }

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

  async getProcessInfo(name: string): Promise<any | null> {
    const list = await this.listProcesses();
    return list.find((p) => p.name === name) || null;
  }
}
