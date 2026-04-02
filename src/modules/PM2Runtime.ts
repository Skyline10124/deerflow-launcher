/**
 * PM2 运行时模块
 * PM2 Runtime Module
 * 
 * 提供打包环境下的 PM2 运行时支持
 * Provides PM2 runtime support in packaged environment
 * 
 * 主要功能 / Key Features:
 * - PM2 实例隔离 / PM2 instance isolation
 * - pkg 打包环境检测 / pkg packaging environment detection
 * - 资源路径解析 / Resource path resolution
 * 
 * @module PM2Runtime
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Logger, getLogger } from './Logger';
import { PM2Error, PM2ErrorCodes } from './PM2ErrorHandler';

/**
 * PM2 模块
 * PM2 module
 * 
 * 使用 require 导入以兼容 pkg 打包
 * Use require for pkg compatibility
 */
const pm2 = require('pm2');

/**
 * PM2 运行时配置选项
 * PM2 Runtime Options
 */
export interface PM2RuntimeOptions {
  /** 日志目录 / Log directory */
  logDir?: string;
  /** PID 文件路径 / PID file path */
  pidFile?: string;
  /** 实例 ID (用于多实例隔离) / Instance ID (for multi-instance isolation) */
  instanceId?: string;
}

/**
 * PM2 守护进程配置
 * PM2 Daemon Configuration
 */
export interface PM2DaemonConfig {
  /** PID 文件路径 / PID file path */
  pidFile: string;
  /** 日志目录 / Log directory */
  logDir: string;
  /** RPC Socket 文件路径 / RPC socket file path */
  rpcSocketFile: string;
  /** Pub/Sub Socket 文件路径 / Pub/Sub socket file path */
  pubSocketFile: string;
}

/**
 * 检测是否运行在 pkg 打包环境中
 * Check if running in pkg packaged environment
 * 
 * pkg 打包后，process.pkg 会被定义
 * After pkg packaging, process.pkg will be defined
 * 
 * @returns 是否为 pkg 环境 / Whether in pkg environment
 */
export function isPkgEnvironment(): boolean {
  return typeof (process as unknown as Record<string, unknown>).pkg !== 'undefined';
}

/**
 * 从入口文件路径推断开发环境的项目根目录
 * Infer project root directory from entry file path in development
 * 
 * @returns 项目根目录 / Project root directory
 */
function getDevRootFromEntry(): string {
  const entryPath = require.main?.filename || process.argv[1];

  if (!entryPath) {
    return process.cwd();
  }

  const entryDir = path.dirname(entryPath);
  const parentDir = path.dirname(entryDir);

  // 如果入口在 dist 目录下，返回上一级 / If entry is in dist, go up one level
  if (path.basename(parentDir) === 'dist') {
    return path.dirname(parentDir);
  }

  // 如果入口在 src 目录下，返回上一级 / If entry is in src, go up one level
  if (path.basename(entryDir) === 'src') {
    return parentDir;
  }

  return process.cwd();
}

/**
 * 获取项目根目录
 * Get project root directory
 * 
 * 在 pkg 环境下返回可执行文件所在目录
 * In pkg environment, returns executable directory
 * 在开发环境下返回项目根目录
 * In development, returns project root
 * 
 * @returns 根目录路径 / Root directory path
 */
export function getPkgRoot(): string {
  if (isPkgEnvironment()) {
    // pkg 打包后，可执行文件在根目录 / After pkg, executable is at root
    return path.dirname(process.execPath);
  }
  return getDevRootFromEntry();
}

/**
 * 获取资源目录路径
 * Get assets directory path
 * 
 * pkg 打包后资源文件存放在 assets 目录
 * After pkg packaging, assets are in assets directory
 * 
 * @returns 资源目录路径 / Assets directory path
 */
export function getPkgAssetsPath(): string {
  return path.join(getPkgRoot(), 'assets');
}

/**
 * 获取脚本文件路径
 * Get script file path
 * 
 * 根据运行环境返回正确的脚本路径
 * Returns correct script path based on runtime environment
 * 
 * @param scriptPath - 脚本相对路径 / Script relative path
 * @returns 脚本绝对路径 / Script absolute path
 */
export function getScriptPath(scriptPath: string): string {
  const scriptName = path.basename(scriptPath);

  if (isPkgEnvironment()) {
    // pkg 环境下脚本在 assets 目录 / Scripts in assets directory in pkg
    return path.join(getPkgAssetsPath(), scriptName);
  }

  // 开发环境下脚本在 scripts 目录 / Scripts in scripts directory in dev
  return path.join(getPkgRoot(), 'scripts', scriptName);
}

/**
 * 获取入口文件路径
 * Get entry file path
 * 
 * @returns 入口文件路径 / Entry file path
 */
export function getEntryPath(): string {
  if (isPkgEnvironment()) {
    // pkg 环境下入口就是可执行文件 / Entry is executable in pkg
    return process.execPath;
  }
  return require.main?.filename || process.argv[1];
}

/**
 * PM2 运行时管理器
 * PM2 Runtime Manager
 * 
 * 管理 PM2 守护进程的生命周期和实例隔离
 * Manages PM2 daemon lifecycle and instance isolation
 * 
 * 每个 launcher 实例使用独立的 PM2_HOME 目录
 * Each launcher instance uses independent PM2_HOME directory
 */
export class PM2Runtime {
  /** 日志记录器 / Logger instance */
  private logger: Logger;
  /** PM2 连接状态 / PM2 connection status */
  private connected: boolean = false;
  /** 日志目录 / Log directory */
  private logDir: string;
  /** 实例 ID / Instance ID */
  private instanceId: string;
  /** PM2 主目录 / PM2 home directory */
  private pm2Home: string;
  /** 之前的 PM2_HOME 环境变量 / Previous PM2_HOME environment variable */
  private previousPm2Home?: string;

  /**
   * 创建 PM2 运行时实例
   * Create PM2 runtime instance
   * 
   * @param options - 运行时配置选项 / Runtime configuration options
   */
  constructor(options: PM2RuntimeOptions = {}) {
    this.logger = getLogger('PM2Runtime');
    this.logDir = options.logDir || '';
    this.instanceId = options.instanceId || 'default';
    this.pm2Home = this.resolvePm2Home();
    this.ensurePm2Home();
  }

  /**
   * 解析 PM2 主目录路径
   * Resolve PM2 home directory path
   * 
   * @returns PM2 主目录路径 / PM2 home directory path
   */
  private resolvePm2Home(): string {
    // 所有实例都在 ~/.deerflow/pm2-instances 下 / All instances under ~/.deerflow/pm2-instances
    const baseDir = path.join(os.homedir(), '.deerflow');
    return path.join(baseDir, 'pm2-instances', this.instanceId);
  }

  /**
   * 确保 PM2 主目录存在
   * Ensure PM2 home directory exists
   */
  private ensurePm2Home(): void {
    if (!fs.existsSync(this.pm2Home)) {
      fs.mkdirSync(this.pm2Home, { recursive: true });
    }
    // 确保日志目录存在 / Ensure log directory exists
    const logDir = path.join(this.pm2Home, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * 获取守护进程配置
   * Get daemon configuration
   * 
   * @returns 守护进程配置 / Daemon configuration
   */
  getDaemonConfig(): PM2DaemonConfig {
    return {
      pidFile: path.join(this.pm2Home, 'pm2.pid'),
      logDir: path.join(this.pm2Home, 'logs'),
      rpcSocketFile: path.join(this.pm2Home, 'rpc.sock'),
      pubSocketFile: path.join(this.pm2Home, 'pub.sock')
    };
  }

  /**
   * 获取环境变量配置
   * Get environment configuration
   * 
   * 返回包含 PM2_HOME 的环境变量
   * Returns environment variables including PM2_HOME
   * 
   * @returns 环境变量对象 / Environment variables object
   */
  getEnvironment(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PM2_HOME: this.pm2Home
    };
  }

  /**
   * 初始化 PM2 运行时
   * Initialize PM2 runtime
   * 
   * 设置 PM2_HOME 环境变量并连接到守护进程
   * Sets PM2_HOME environment variable and connects to daemon
   * 
   * @throws {PM2Error} 连接失败时抛出错误 / Throws error if connection fails
   */
  async initialize(): Promise<void> {
    this.logger.debug('Initializing PM2 runtime...');

    // 保存并设置 PM2_HOME / Save and set PM2_HOME
    this.previousPm2Home = process.env.PM2_HOME;
    process.env.PM2_HOME = this.pm2Home;

    try {
      await this.connect();
      this.logger.debug('PM2 runtime initialized');
    } catch (error) {
      this.restoreEnvironment();
      throw error;
    }
  }

  /**
   * 恢复原始环境变量
   * Restore original environment variables
   */
  private restoreEnvironment(): void {
    if (this.previousPm2Home === undefined) {
      delete process.env.PM2_HOME;
    } else {
      process.env.PM2_HOME = this.previousPm2Home;
    }
  }

  /**
   * 连接到 PM2 守护进程
   * Connect to PM2 daemon
   * 
   * @throws {PM2Error} 连接失败时抛出错误 / Throws error if connection fails
   */
  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.connect((err: Error | null) => {
        if (err) {
          this.logger.error(`Failed to connect to PM2: ${err.message}`);
          reject(new PM2Error(
            PM2ErrorCodes.PM2_CONNECT_FAILED,
            `Failed to connect to PM2 daemon: ${err.message}`,
            'PM2 daemon may be corrupted. Try "deerflow clean" to reset'
          ));
        } else {
          this.connected = true;
          this.logger.debug('Connected to PM2 daemon');
          resolve();
        }
      });
    });
  }

  /**
   * 断开与 PM2 守护进程的连接
   * Disconnect from PM2 daemon
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    return new Promise((resolve) => {
      try {
        pm2.disconnect();
        this.connected = false;
        this.restoreEnvironment();
        this.logger.debug('Disconnected from PM2 daemon');
      } catch (_error) {
        this.logger.warn('Error during PM2 disconnect');
      }
      resolve();
    });
  }

  /**
   * 检查是否已连接
   * Check if connected
   * 
   * @returns 连接状态 / Connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 获取 PM2 主目录
   * Get PM2 home directory
   * 
   * @returns PM2 主目录路径 / PM2 home directory path
   */
  getPm2Home(): string {
    return this.pm2Home;
  }

  /**
   * 获取实例 ID
   * Get instance ID
   * 
   * @returns 实例 ID / Instance ID
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * 获取 PID 文件路径
   * Get PID file path
   * 
   * @returns PID 文件路径 / PID file path
   */
  getPidFile(): string {
    return path.join(this.pm2Home, 'pm2.pid');
  }

  /**
   * 获取日志目录
   * Get log directory
   * 
   * @returns 日志目录路径 / Log directory path
   */
  getLogDir(): string {
    return path.join(this.pm2Home, 'logs');
  }

  /**
   * 获取 RPC Socket 文件路径
   * Get RPC socket file path
   * 
   * @returns RPC Socket 文件路径 / RPC socket file path
   */
  getRpcSocketFile(): string {
    return path.join(this.pm2Home, 'rpc.sock');
  }

  /**
   * 获取 Pub/Sub Socket 文件路径
   * Get Pub/Sub socket file path
   * 
   * @returns Pub/Sub Socket 文件路径 / Pub/Sub socket file path
   */
  getPubSocketFile(): string {
    return path.join(this.pm2Home, 'pub.sock');
  }

  /**
   * 终止 PM2 守护进程
   * Kill PM2 daemon
   */
  async killDaemon(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
    
    return new Promise((resolve) => {
      pm2.killDaemon((err: Error | null) => {
        if (err) {
          this.logger.warn(`Error killing PM2 daemon: ${err.message}`);
        } else {
          this.logger.debug('PM2 daemon killed');
        }
        this.connected = false;
        this.restoreEnvironment();
        resolve();
      });
    });
  }

  /**
   * 列出所有 PM2 实例
   * List all PM2 instances
   * 
   * 静态方法，扫描 ~/.deerflow/pm2-instances 目录
   * Static method, scans ~/.deerflow/pm2-instances directory
   * 
   * @returns 实例 ID 列表 / List of instance IDs
   */
  static listInstances(): string[] {
    const baseDir = path.join(os.homedir(), '.deerflow', 'pm2-instances');
    if (!fs.existsSync(baseDir)) {
      return [];
    }
    return fs.readdirSync(baseDir).filter(name => {
      const instanceDir = path.join(baseDir, name);
      return fs.statSync(instanceDir).isDirectory();
    });
  }

  /**
   * 移除指定实例
   * Remove specified instance
   * 
   * 删除实例目录及其所有内容
   * Deletes instance directory and all its contents
   * 
   * @param instanceId - 实例 ID / Instance ID
   * @returns 是否成功删除 / Whether deletion was successful
   */
  static removeInstance(instanceId: string): boolean {
    if (!instanceId || /[/\\]/.test(instanceId) || instanceId.includes('..')) {
      throw new Error(`Invalid instance ID: "${instanceId}"`);
    }
    const expectedParent = path.resolve(os.homedir(), '.deerflow', 'pm2-instances');
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
