import * as path from 'path';
import * as fs from 'fs';
import * as pm2 from 'pm2';
import { Logger, getLogger } from './Logger';
import { HealthChecker } from './HealthChecker';
import {
  ServiceDefinition,
  ServiceInstance,
  ServiceStatus,
  ServiceName,
  ErrorCodes
} from '../types';

const MANAGED_SERVICE_NAMES = Object.values(ServiceName);

/**
 * PM2 进程配置接口
 * 定义 PM2 启动进程所需的配置项
 */
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

/**
 * 进程管理器
 * 使用 PM2 管理 DeerFlow 各服务的生命周期
 */
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

  /** 连接到 PM2 守护进程 */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        pm2.connect((err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            this.connected = true;
            this.logger.debug('Connected to PM2');
            resolve();
          }
        });
      });

      await this.cleanupStaleProcesses();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to connect to PM2: ${errorMsg}`);
      throw new Error(`PM2 connection failed: ${errorMsg}`);
    }
  }

  /** 判断进程是否为过期进程 (日志路径不匹配) */
  private isStaleProcess(proc: any, normalizedLogDir: string): boolean {
    if (!MANAGED_SERVICE_NAMES.includes(proc.name)) {
      return false;
    }
    const procLogPath = proc.pm2_env?.pm_log_path || proc.pm2_env?.log_file || '';
    if (!procLogPath) {
      return false;
    }
    const normalizedProcLogPath = path.resolve(procLogPath).toLowerCase();
    return !normalizedProcLogPath.startsWith(normalizedLogDir);
  }

  /** 删除指定的 PM2 进程 */
  private async deleteProcess(name: string): Promise<void> {
    return new Promise<void>((resolve) => {
      pm2.delete(name, () => resolve());
    });
  }

  /** 清理不属于当前 launcher 的过期进程 */
  private async cleanupStaleProcesses(): Promise<void> {
    try {
      const list = await this.listProcesses();
      const normalizedLogDir = path.resolve(this.logDir).toLowerCase();
      
      for (const proc of list) {
        if (this.isStaleProcess(proc, normalizedLogDir)) {
          this.logger.debug(`Cleaning stale process (log path mismatch): ${proc.name}`);
          await this.deleteProcess(proc.name);
        }
      }
    } catch (error) {
      this.logger.debug(`Failed to cleanup stale processes: ${error}`);
    }
  }

  /** 断开与 PM2 守护进程的连接 */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    return new Promise<void>((resolve) => {
      try {
        pm2.disconnect();
        this.connected = false;
        this.logger.debug('Disconnected from PM2');
      } catch {
        this.logger.warn('Error during PM2 disconnect');
      }
      resolve();
    });
  }

  /** 强制断开 PM2 连接 (忽略错误) */
  forceDisconnect(): void {
    if (this.connected) {
      try {
        pm2.disconnect();
      } catch {}
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** 构建 PM2 进程配置 */
  private buildPM2Config(service: ServiceDefinition): PM2ProcessConfig {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    const isNodeScript = service.script.endsWith('.js') || 
                         service.script.endsWith('.ts') ||
                         service.script.endsWith('.mjs');
    
    const isWindows = process.platform === 'win32';
    const nullDevice = isWindows ? '\\\\.\\NUL' : '/dev/null';
    
    let script = service.script;
    let args = service.args || [];
    let interpreter: string | undefined;
    
    if (isNodeScript) {
      interpreter = undefined;
    } else if (isWindows) {
      const wrapperPath = path.join(process.cwd(), 'scripts', 'wrapper.js');
      script = process.execPath;
      args = [wrapperPath, service.name, service.script, ...(service.args || [])];
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
      out_file: nullDevice,
      error_file: nullDevice,
      merge_logs: true,
      time: isWindows && !isNodeScript ? false : true,
      env: service.env,
      ...(isWindows && !isNodeScript ? { 
        windowsHide: true,
        kill_timeout: 3000
      } : {})
    };

    return config;
  }

  /**
   * 启动服务 (阻塞模式)
   * 等待健康检查通过后返回
   */
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
      await this.deleteExistingProcess(service.name);

      const config = this.buildPM2Config(service);

      const proc = await new Promise<any>((resolve, reject) => {
        pm2.start(config, (err: Error | null, proc: any) => {
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

  /**
   * 启动服务 (分离模式)
   * 不等待健康检查，立即返回
   */
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
      await this.deleteExistingProcess(service.name);

      const config = this.buildPM2Config(service);

      await new Promise<void>((resolve, reject) => {
        pm2.start(config, (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      this.logger.info(`${service.name} started in background`);
    } catch (error) {
      instance.status = ServiceStatus.FAILED;
      instance.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start ${service.name}: ${instance.error}`);
      throw error;
    }

    return instance;
  }

  /** 停止指定服务 */
  async stopService(name: ServiceName): Promise<void> {
    this.logger.info(`Stopping ${name} service...`);

    const timeout = 3000;
    
    if (!this.connected) {
      this.logger.info(`Stopped ${name} (not connected)`);
      return;
    }
    
    try {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.logger.warn(`pm2.stop(${name}) timeout, continuing...`);
          resolve();
        }, timeout);
        
        pm2.stop(name, (err: Error | null) => {
          clearTimeout(timer);
          if (err) {
            this.logger.debug(`pm2.stop(${name}) error: ${err.message}`);
          }
          resolve();
        });
      });

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.logger.warn(`pm2.delete(${name}) timeout, continuing...`);
          resolve();
        }, timeout);
        
        pm2.delete(name, (err: Error | null) => {
          clearTimeout(timer);
          if (err) {
            this.logger.debug(`pm2.delete(${name}) error: ${err.message}`);
          }
          resolve();
        });
      });

      this.logger.info(`Stopped ${name}`);
    } catch (error) {
      this.logger.warn(`Error stopping ${name}: ${error}, continuing...`);
    }
  }

  /** 删除已存在的同名进程 */
  private async deleteExistingProcess(name: string): Promise<void> {
    try {
      const list = await this.listProcesses();
      const existing = list.find((p) => p.name === name);
      if (existing) {
        this.logger.debug(`Deleting existing process: ${name}`);
        await new Promise<void>((resolve, reject) => {
          pm2.stop(name, (stopErr: Error | null) => {
            pm2.delete(name, (delErr: Error | null) => {
              if (delErr && !delErr.message.includes("doesn't exist")) {
                reject(delErr);
              } else {
                resolve();
              }
            });
          });
        });
      }
    } catch {
      // Ignore errors - process may not exist
    }
  }

  /** 终止所有托管的服务进程 */
  async killAllManagedProcesses(): Promise<void> {
    this.logger.info('Killing all managed processes...');
    try {
      const list = await this.listProcesses();
      for (const proc of list) {
        if (MANAGED_SERVICE_NAMES.includes(proc.name)) {
          this.logger.debug(`Killing process: ${proc.name}`);
          await new Promise<void>((resolve) => {
            pm2.delete(proc.name, () => resolve());
          });
        }
      }
    } catch {
      // Ignore errors
    }
  }

  /** 按顺序停止所有服务 */
  async stopAll(services: Map<ServiceName, ServiceInstance>): Promise<void> {
    this.logger.info('Stopping all services...');

    const stopOrder = [ServiceName.NGINX, ServiceName.FRONTEND, ServiceName.GATEWAY, ServiceName.LANGGRAPH];
    
    for (const name of stopOrder) {
      const instance = services.get(name);
      if (instance && (instance.status === ServiceStatus.HEALTHY || 
          instance.status === ServiceStatus.STARTING)) {
        await this.stopService(name);
      }
    }
  }

  /** 获取所有 PM2 进程列表 */
  async listProcesses(): Promise<any[]> {
    if (!this.connected) {
      return [];
    }

    return new Promise<any[]>((resolve, reject) => {
      pm2.list((err: Error | null, list: any[]) => {
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
