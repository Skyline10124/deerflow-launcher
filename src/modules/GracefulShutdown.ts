/**
 * 优雅关闭模块
 * Graceful Shutdown Module
 * 
 * 提供服务进程的优雅关闭功能
 * Provides graceful shutdown functionality for service processes
 * 
 * 主要功能 / Key Features:
 * - 信号处理 (SIGINT, SIGTERM, SIGBREAK) / Signal handling
 * - 按顺序停止服务 / Ordered service shutdown
 * - 超时控制 / Timeout control
 * 
 * @module GracefulShutdown
 */

import { Logger, getLogger } from './Logger';
import { ServiceName } from '../types';

/**
 * 关闭结果
 * Shutdown Result
 */
export interface ShutdownResult {
  /** 服务名称 / Service name */
  serviceName: string;
  /** 是否成功 / Whether successful */
  success: boolean;
  /** 耗时 (毫秒) / Duration in milliseconds */
  duration: number;
  /** 错误消息 (失败时) / Error message (when failed) */
  error?: string;
}

/**
 * 关闭配置
 * Shutdown Configuration
 */
export interface ShutdownConfig {
  /** 优雅关闭超时时间 (毫秒) / Graceful shutdown timeout in ms */
  gracefulTimeout: number;
  /** 强制终止超时时间 (毫秒) / Force kill timeout in ms */
  forceKillTimeout: number;
  /** 关闭顺序 / Shutdown order */
  shutdownOrder: ServiceName[];
}

/**
 * 默认关闭配置
 * Default Shutdown Configuration
 */
const DEFAULT_CONFIG: ShutdownConfig = {
  gracefulTimeout: 10000,
  forceKillTimeout: 5000,
  // 按依赖关系逆序关闭 / Shutdown in reverse dependency order
  shutdownOrder: [ServiceName.NGINX, ServiceName.FRONTEND, ServiceName.GATEWAY, ServiceName.LANGGRAPH]
};

/**
 * 停止服务函数类型
 * Stop Service Function Type
 */
export type StopServiceFn = (name: ServiceName) => Promise<void>;

/**
 * 优雅关闭管理器
 * Graceful Shutdown Manager
 * 
 * 处理进程信号并按顺序关闭服务
 * Handles process signals and shuts down services in order
 */
export class GracefulShutdown {
  /** 日志记录器 / Logger instance */
  private logger: Logger;
  /** 关闭配置 / Shutdown configuration */
  private config: ShutdownConfig;
  /** 是否正在关闭 / Whether shutting down */
  private isShuttingDown: boolean = false;
  /** 停止服务函数 / Stop service function */
  private stopServiceFn?: StopServiceFn;
  /** 关闭 Promise (防止重复关闭) / Shutdown promise (prevents duplicate shutdown) */
  private shutdownPromise?: Promise<void>;

  /**
   * 创建优雅关闭管理器
   * Create graceful shutdown manager
   * 
   * @param config - 部分关闭配置 / Partial shutdown configuration
   */
  constructor(config: Partial<ShutdownConfig> = {}) {
    this.logger = getLogger('Shutdown');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 设置停止服务函数
   * Set stop service function
   * 
   * @param fn - 停止服务函数 / Stop service function
   */
  setStopServiceFn(fn: StopServiceFn): void {
    this.stopServiceFn = fn;
  }

  /**
   * 设置信号处理器
   * Setup signal handlers
   * 
   * 注册 SIGINT, SIGTERM, SIGBREAK 等信号处理
   * Registers handlers for SIGINT, SIGTERM, SIGBREAK signals
   */
  setupSignalHandlers(): void {
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    
    // Windows 特有信号 / Windows-specific signal
    if (process.platform === 'win32') {
      process.on('SIGBREAK', () => this.handleShutdown('SIGBREAK'));
    }

    // 忽略用户信号 / Ignore user signals
    process.on('SIGUSR1', () => {});
    process.on('SIGUSR2', () => {});

    this.logger.debug('Signal handlers registered');
  }

  /**
   * 处理关闭信号
   * Handle shutdown signal
   * 
   * @param signal - 信号名称 / Signal name
   */
  private async handleShutdown(signal: string): Promise<void> {
    // 使用 shutdownPromise 作为主守卫，避免重复执行
    // Use shutdownPromise as primary guard to prevent duplicate execution
    if (this.shutdownPromise) {
      this.logger.debug('Already shutting down, ignoring signal');
      await this.shutdownPromise;
      return;
    }

    this.isShuttingDown = true;
    this.logger.info(`收到关闭信号 ${signal}，开始优雅关闭...`);

    this.shutdownPromise = this.executeShutdown();

    // 设置强制退出超时 / Set force exit timeout
    const timeout = this.config.gracefulTimeout + this.config.forceKillTimeout + 2000;
    
    const forceExit = setTimeout(() => {
      this.logger.error('强制退出超时，立即终止');
      process.exit(1);
    }, timeout);

    await this.shutdownPromise;
    clearTimeout(forceExit);
    
    this.logger.info('所有服务已停止，退出码: 0');
    // 短暂延迟确保日志写入 / Brief delay to ensure logs are written
    await new Promise(resolve => setTimeout(resolve, 100));
    process.exit(0);
  }

  /**
   * 执行关闭流程
   * Execute shutdown process
   */
  private async executeShutdown(): Promise<void> {
    if (!this.stopServiceFn) {
      this.logger.warn('No stop service function registered');
      return;
    }

    const results: ShutdownResult[] = [];

    // 按顺序停止服务 / Stop services in order
    for (const serviceName of this.config.shutdownOrder) {
      this.logger.debug(`Starting to stop ${serviceName}...`);
      const startTime = Date.now();
      
      try {
        await this.stopServiceWithTimeout(serviceName);
        const duration = Date.now() - startTime;
        
        results.push({
          serviceName,
          success: true,
          duration
        });
        
        this.logger.info(`正在停止 ${serviceName}... 成功 (${duration}ms)`);
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        results.push({
          serviceName,
          success: false,
          duration,
          error: errorMsg
        });
        
        this.logger.error(`正在停止 ${serviceName}... 失败: ${errorMsg}`);
      }
    }

    // 输出关闭统计 / Output shutdown statistics
    const successCount = results.filter(r => r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    
    this.logger.info(`关闭完成: ${successCount}/${results.length} 服务成功 (总耗时: ${totalDuration}ms)`);
  }

  /**
   * 带超时的停止服务
   * Stop service with timeout
   * 
   * @param serviceName - 服务名称 / Service name
   * @throws {Error} 超时或停止失败时抛出错误 / Throws error on timeout or stop failure
   */
  private async stopServiceWithTimeout(serviceName: ServiceName): Promise<void> {
    if (!this.stopServiceFn) {
      throw new Error('Stop service function not registered');
    }

    const stopFn = this.stopServiceFn;
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout after ${this.config.gracefulTimeout}ms`));
      }, this.config.gracefulTimeout);

      stopFn(serviceName)
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * 手动执行关闭
   * Manual shutdown
   * 
   * @param services - 要关闭的服务列表 (可选) / Services to shutdown (optional)
   * @returns 关闭结果列表 / List of shutdown results
   */
  async shutdown(services?: ServiceName[]): Promise<ShutdownResult[]> {
    if (this.isShuttingDown) {
      return [];
    }

    this.isShuttingDown = true;
    const results: ShutdownResult[] = [];
    const order = services || this.config.shutdownOrder;

    for (const serviceName of order) {
      const startTime = Date.now();
      
      try {
        if (this.stopServiceFn) {
          await this.stopServiceWithTimeout(serviceName);
        }
        
        results.push({
          serviceName,
          success: true,
          duration: Date.now() - startTime
        });
      } catch (error) {
        results.push({
          serviceName,
          success: false,
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  /**
   * 检查是否正在关闭
   * Check if shutting down
   * 
   * @returns 是否正在关闭 / Whether shutting down
   */
  isInShutdown(): boolean {
    return this.isShuttingDown;
  }
}
