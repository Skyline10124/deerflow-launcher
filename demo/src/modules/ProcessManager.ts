import * as path from 'path';
import * as fs from 'fs';
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
  exec_mode?: string;
  instances?: number;
  autorestart?: boolean;
  max_restarts?: number;
  min_uptime?: string;
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
  private pm2: any = null;
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
      this.pm2 = require('pm2');
      
      await new Promise<void>((resolve, reject) => {
        this.pm2.connect((err: Error | null) => {
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
    if (!this.connected || !this.pm2) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.pm2.disconnect(() => {
        this.connected = false;
        this.logger.debug('Disconnected from PM2');
        resolve();
      });
    });
  }

  private buildPM2Config(service: ServiceDefinition): PM2ProcessConfig {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    return {
      name: service.name,
      script: service.script,
      args: service.args,
      cwd: service.cwd,
      exec_mode: 'fork',
      instances: 1,
      autorestart: false,
      max_restarts: 0,
      min_uptime: '10s',
      log_file: path.join(this.logDir, `${service.name}.log`),
      out_file: path.join(this.logDir, `${service.name}-out.log`),
      error_file: path.join(this.logDir, `${service.name}-error.log`),
      merge_logs: false,
      time: true,
      env: service.env
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
      const config = this.buildPM2Config(service);

      const proc = await new Promise<any>((resolve, reject) => {
        this.pm2.start(config, (err: Error | null, proc: any) => {
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
    this.logger.info(`Stopping ${name} service...`);

    try {
      await new Promise<void>((resolve, reject) => {
        this.pm2.stop(name, (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      await new Promise<void>((resolve, reject) => {
        this.pm2.delete(name, (err: Error | null) => {
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
      this.pm2.list((err: Error | null, list: any[]) => {
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
