/**
 * 进程管理器模块
 * Process Manager Module
 * 
 * 使用 PM2 管理 DeerFlow 各服务的生命周期
 * Manages the lifecycle of DeerFlow services using PM2
 * 
 * @module ProcessManager
 */

import * as path from 'path';
import * as fs from 'fs';
import { Logger, getLogger } from './Logger.js';
import { HealthChecker } from './HealthChecker.js';
import { PM2Runtime, getScriptPath } from './PM2Runtime.js';
import { loadDotEnv } from '../utils/env.js';
import {
  ServiceDefinition,
  ServiceInstance,
  ServiceStatus,
  ServiceName
} from '../types/index.js';

/**
 * PM2 模块
 * PM2 module
 * 
 * 使用 require 导入以兼容 pkg 打包
 * Use require for pkg compatibility
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pm2 = require('pm2');
import type { Proc, ProcessDescription } from 'pm2';

/**
 * 托管的服务名称列表
 * List of managed service names
 * 用于识别哪些进程属于当前 launcher 实例
 * Used to identify which processes belong to the current launcher instance
 */
const MANAGED_SERVICE_NAMES: readonly ServiceName[] = Object.values(ServiceName);

/**
 * PM2 进程配置接口
 * PM2 Process Configuration Interface
 * 
 * 定义 PM2 启动进程所需的配置项
 * Defines configuration options for PM2 process startup
 */
export interface PM2ProcessConfig {
  /** 进程名称 / Process name */
  name: string;
  /** 脚本路径 / Script path */
  script: string;
  /** 脚本参数 / Script arguments */
  args?: string[];
  /** 工作目录 / Working directory */
  cwd: string;
  /** 解释器路径 / Interpreter path */
  interpreter?: string;
  /** 执行模式: fork 或 cluster / Execution mode: fork or cluster */
  exec_mode?: string;
  /** 实例数量 / Number of instances */
  instances?: number;
  /** 是否自动重启 / Auto restart on failure */
  autorestart?: boolean;
  /** 最大重启次数 / Maximum restart attempts */
  max_restarts?: number;
  /** 最小运行时间 (ms) / Minimum uptime in milliseconds */
  min_uptime?: number;
  /** 日志文件路径 / Log file path */
  log_file?: string;
  /** 标准输出文件 / Standard output file */
  out_file?: string;
  /** 错误输出文件 / Error output file */
  error_file?: string;
  /** 是否合并日志 / Merge logs */
  merge_logs?: boolean;
  /** 是否添加时间戳 / Add timestamps to logs */
  time?: boolean;
  /** 环境变量 / Environment variables */
  env?: Record<string, string>;
  windowsHide?: boolean;
  kill_timeout?: number;
}

/**
 * 进程管理器
 * Process Manager
 * 
 * 使用 PM2 管理 DeerFlow 各服务的生命周期
 * Manages the lifecycle of DeerFlow services using PM2
 * 
 * 主要功能 / Key Features:
 * - 服务启动与停止 / Service start and stop
 * - 健康检查 / Health checking
 * - 过期进程清理 / Stale process cleanup
 * - 进程状态监控 / Process status monitoring
 */
export class ProcessManager {
  /** 日志记录器 / Logger instance */
  private logger: Logger;
  /** 健康检查器 / Health checker instance */
  private healthChecker: HealthChecker;
  /** PM2 连接状态 / PM2 connection status */
  private connected: boolean = false;
  /** 日志目录 / Log directory */
  private logDir: string;
  /** PM2 运行时实例 / PM2 runtime instance */
  private pm2Runtime: PM2Runtime | null = null;
  /** DeerFlow 项目根目录 / DeerFlow project root directory */
  private deerflowPath: string;
  /** 从 .env 文件加载的环境变量 / Environment variables loaded from .env file */
  private dotEnvVars: Record<string, string> = {};
  /** 实例 ID / Instance ID */
  private instanceId: string;

  /**
   * 创建进程管理器实例
   * Create a ProcessManager instance
   *
   * @param logDir - 日志目录路径 / Log directory path
   * @param deerflowPath - DeerFlow 项目根目录 / DeerFlow project root directory
   * @param instanceId - 实例 ID / Instance ID
   */
  constructor(logDir: string, deerflowPath: string, instanceId: string = 'default') {
    this.logger = getLogger('ProcessMgr');
    this.healthChecker = new HealthChecker();
    this.logDir = logDir;
    this.deerflowPath = deerflowPath;
    this.instanceId = instanceId;
    this.dotEnvVars = loadDotEnv(deerflowPath);
  }

  /**
   * 连接到 PM2 守护进程
   * Connect to PM2 daemon
   * 
   * 初始化 PM2 运行时并建立连接
   * Initializes PM2 runtime and establishes connection
   * 
   * @throws {Error} 连接失败时抛出错误 / Throws error if connection fails
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      // 创建并初始化 PM2 运行时 / Create and initialize PM2 runtime
      this.pm2Runtime = new PM2Runtime({ 
        logDir: this.logDir,
        instanceId: this.instanceId,
      });
      await this.pm2Runtime.initialize();
      this.connected = true;
      this.logger.debug(`Connected to PM2 (instance: ${this.instanceId})`);

      // 清理不属于当前实例的过期进程 / Clean up stale processes from other instances
      await this.cleanupStaleProcesses();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to connect to PM2: ${errorMsg}`);
      throw new Error(`PM2 connection failed: ${errorMsg}`);
    }
  }

  /**
   * 判断进程是否为过期进程
   * Check if a process is stale
   * 
   * 通过比较日志路径判断进程是否属于当前 launcher 实例
   * Determines if a process belongs to current launcher instance by comparing log paths
   * 
   * @param proc - PM2 进程描述 / PM2 process description
   * @param normalizedLogDir - 标准化的日志目录路径 / Normalized log directory path
   * @returns 是否为过期进程 / Whether the process is stale
   */
  private isStaleProcess(proc: ProcessDescription, normalizedLogDir: string): boolean {
    // 非托管服务，不是过期进程 / Not a managed service, not stale
    if (!proc.name || !MANAGED_SERVICE_NAMES.includes(proc.name as ServiceName)) {
      return false;
    }
    // 获取进程的日志路径 / Get process log path
    const procLogPath = proc.pm2_env?.pm_out_log_path || proc.pm2_env?.pm_err_log_path || '';
    if (!procLogPath) {
      return false;
    }
    // 比较路径前缀 / Compare path prefix
    const normalizedProcLogPath = path.resolve(procLogPath).toLowerCase();
    return !normalizedProcLogPath.startsWith(normalizedLogDir);
  }

  /**
   * 删除指定的 PM2 进程
   * Delete a specific PM2 process
   * 
   * @param name - 进程名称 / Process name
   */
  private async deleteProcess(name: string): Promise<void> {
    return new Promise<void>((resolve) => {
      pm2.delete(name, () => resolve());
    });
  }

  /**
   * 清理不属于当前 launcher 的过期进程
   * Clean up stale processes not belonging to current launcher
   * 
   * 当多个 launcher 实例运行时，需要清理其他实例的进程
   * When multiple launcher instances run, clean up processes from other instances
   */
  private async cleanupStaleProcesses(): Promise<void> {
    try {
      const list = await this.listProcesses();
      const normalizedLogDir = path.resolve(this.logDir).toLowerCase();
      
      for (const proc of list) {
        if (proc.name && this.isStaleProcess(proc, normalizedLogDir)) {
          this.logger.debug(`Cleaning stale process (log path mismatch): ${proc.name}`);
          await this.deleteProcess(proc.name);
        }
      }
    } catch (error) {
      this.logger.debug(`Failed to cleanup stale processes: ${error}`);
    }
  }

  /**
   * 断开与 PM2 的连接
   * Disconnect from PM2
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      if (this.pm2Runtime) {
        await this.pm2Runtime.disconnect();
      }
      this.connected = false;
      this.pm2Runtime = null;
      this.logger.debug('Disconnected from PM2');
    } catch {
      this.logger.warn('Error during PM2 disconnect');
    }
  }

  /**
   * 强制断开 PM2 连接
   * Force disconnect from PM2
   * 
   * 忽略所有错误，用于紧急情况
   * Ignores all errors, used for emergency situations
   */
  forceDisconnect(): void {
    if (this.connected) {
      try {
        pm2.disconnect();
      } catch (error) {
        this.logger.debug(`Force disconnect error (expected): ${error}`);
      }
      this.connected = false;
      this.pm2Runtime = null;
    }
  }

  /**
   * 检查是否已连接到 PM2
   * Check if connected to PM2
   * 
   * @returns 连接状态 / Connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 构建 PM2 进程配置
   * Build PM2 process configuration
   * 
   * 根据服务定义生成 PM2 启动配置
   * Generates PM2 startup configuration from service definition
   * 
   * @param service - 服务定义 / Service definition
   * @returns PM2 配置对象 / PM2 configuration object
   */
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
      script = getScriptPath('wrapper.js');
      args = [service.name, service.script, ...args];
      interpreter = undefined;
    } else {
      interpreter = 'none';
    }
    
    const logFile = path.join(this.logDir, `${service.name}.log`);
    
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
      log_file: logFile,
      out_file: logFile,
      error_file: logFile,
      merge_logs: true,
      time: true,
      env: { ...this.dotEnvVars, ...service.env },
      ...(isWindows && !isNodeScript ? {
        windowsHide: true,
        kill_timeout: 3000
      } : {})
    };

    return config;
  }

  /**
   * 启动服务 (阻塞模式)
   * Start service (blocking mode)
   * 
   * 等待健康检查通过后返回
   * Waits for health check to pass before returning
   * 
   * @param service - 服务定义 / Service definition
   * @param dependencies - 依赖服务映射 / Dependency services map
   * @returns 服务实例 / Service instance
   * @throws {Error} 依赖未就绪或启动失败时抛出错误 / Throws if dependencies not ready or start fails
   */
  async startService(
    service: ServiceDefinition,
    dependencies: Map<ServiceName, ServiceInstance>
  ): Promise<ServiceInstance> {
    this.logger.info(`Starting ${service.name} service...`);

    // 检查依赖服务状态 / Check dependency service status
    if (service.dependencies) {
      for (const depName of service.dependencies) {
        const dep = dependencies.get(depName);
        if (!dep || dep.status !== ServiceStatus.HEALTHY) {
          throw new Error(`Dependency ${depName} is not ready`);
        }
      }
    }

    // 创建服务实例 / Create service instance
    const instance: ServiceInstance = {
      name: service.name,
      status: ServiceStatus.STARTING,
      port: service.port,
      startTime: new Date()
    };

    try {
      // 删除已存在的同名进程 / Delete existing process with same name
      await this.deleteExistingProcess(service.name);

      // 构建并应用 PM2 配置 / Build and apply PM2 configuration
      const config = this.buildPM2Config(service);

      // 启动进程 / Start process
      const proc = await new Promise<Proc>((resolve, reject) => {
        pm2.start(config, (err: Error | null, proc: Proc) => {
          if (err) {
            reject(err);
          } else {
            resolve(proc);
          }
        });
      });

      // 记录进程 ID / Record process ID
      if (proc && proc.pm_id !== undefined) {
        instance.pid = proc.pm_id;
      }

      this.logger.debug(`${service.name} process started, waiting for health check...`);

      // 执行健康检查 / Perform health check
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

  /**
   * 检测服务日志中的配置错误
   * Detect configuration errors in service logs
   * 
   * @param serviceName - 服务名称 / Service name
   * @returns 错误信息或 null / Error message or null
   */
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

  /**
   * 启动服务 (分离模式)
   * Start service (detached mode)
   * 
   * 不等待健康检查，立即返回
   * Returns immediately without waiting for health check
   * 
   * @param service - 服务定义 / Service definition
   * @param dependencies - 依赖服务映射 / Dependency services map
   * @returns 服务实例 / Service instance
   * @throws {Error} 依赖未就绪或启动失败时抛出错误 / Throws if dependencies not ready or start fails
   */
  async startServiceDetached(
    service: ServiceDefinition,
    dependencies: Map<ServiceName, ServiceInstance>
  ): Promise<ServiceInstance> {
    this.logger.info(`Starting ${service.name} service (detached)...`);

    // 检查依赖服务状态 (允许 STARTING 状态) / Check dependencies (allow STARTING status)
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

  /**
   * 停止指定服务
   * Stop a specific service
   * 
   * @param name - 服务名称 / Service name
   */
  async stopService(name: ServiceName): Promise<void> {
    this.logger.info(`Stopping ${name} service...`);

    const timeout = 3000;  // 超时时间 3 秒 / Timeout 3 seconds
    
    if (!this.connected) {
      this.logger.info(`Stopped ${name} (not connected)`);
      return;
    }
    
    try {
      // 先停止进程 / Stop process first
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

      // 再删除进程 / Then delete process
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

  /**
   * 删除已存在的同名进程
   * Delete existing process with same name
   * 
   * @param name - 进程名称 / Process name
   */
  private async deleteExistingProcess(name: string): Promise<void> {
    try {
      const list = await this.listProcesses();
      const existing = list.find((p) => p.name === name);
      if (existing) {
        this.logger.debug(`Deleting existing process: ${name}`);
        await new Promise<void>((resolve, reject) => {
          pm2.stop(name, (_stopErr: Error | null) => {
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
    } catch (error) {
      // 进程可能不存在 / Process may not exist
      this.logger.debug(`deleteExistingProcess: process may not exist: ${error}`);
    }
  }

  /**
   * 终止所有托管的服务进程
   * Kill all managed service processes
   * 
   * 并行终止所有属于当前 launcher 的进程
   * Terminates all processes belonging to current launcher in parallel
   */
  async killAllManagedProcesses(): Promise<void> {
    this.logger.info('Killing all managed processes...');
    try {
      const list = await this.listProcesses();
      
      // 并行终止所有托管进程 / Kill all managed processes in parallel
      const killPromises = list.map(async (proc) => {
        const procName = proc.name;
        if (procName && (MANAGED_SERVICE_NAMES as readonly string[]).includes(procName)) {
          this.logger.debug(`Killing process: ${procName}`);
          return new Promise<void>((resolve) => {
            pm2.delete(procName, () => resolve());
          });
        }
      });
      
      await Promise.all(killPromises);
    } catch (error) {
      // 清理时的错误不应阻止流程 / Cleanup errors should not block the flow
      this.logger.debug(`killAllManagedProcesses cleanup error: ${error}`);
    }
  }

  /**
   * 按顺序停止所有服务
   * Stop all services in order
   * 
   * 按照依赖关系的逆序停止服务
   * Stops services in reverse order of dependencies
   * 
   * @param services - 服务实例映射 / Service instances map
   */
  async stopAll(services: Map<ServiceName, ServiceInstance>): Promise<void> {
    this.logger.info('Stopping all services...');

    // 停止顺序: Nginx -> Frontend -> Gateway -> LangGraph
    // Stop order: Nginx -> Frontend -> Gateway -> LangGraph
    const stopOrder = [ServiceName.NGINX, ServiceName.FRONTEND, ServiceName.GATEWAY, ServiceName.LANGGRAPH];
    
    for (const name of stopOrder) {
      const instance = services.get(name);
      if (instance && (instance.status === ServiceStatus.HEALTHY || 
          instance.status === ServiceStatus.STARTING)) {
        await this.stopService(name);
      }
    }
  }

  /**
   * 获取所有 PM2 进程列表
   * Get list of all PM2 processes
   * 
   * @returns 进程描述列表 / Process description list
   */
  async listProcesses(): Promise<ProcessDescription[]> {
    if (!this.connected) {
      return [];
    }

    return new Promise<ProcessDescription[]>((resolve, reject) => {
      pm2.list((err: Error | null, list: ProcessDescription[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(list);
        }
      });
    });
  }

  /**
   * 获取指定进程的信息
   * Get information of a specific process
   * 
   * @param name - 进程名称 / Process name
   * @returns 进程描述，不存在则返回 null / Process description, or null if not exists
   */
  async getProcessInfo(name: string): Promise<ProcessDescription | null> {
    const list = await this.listProcesses();
    return list.find((p) => p.name === name) || null;
  }
}
