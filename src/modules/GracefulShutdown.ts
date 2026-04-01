import { Logger, getLogger } from './Logger';
import { ServiceName } from '../types';

export interface ShutdownResult {
  serviceName: string;
  success: boolean;
  duration: number;
  error?: string;
}

export interface ShutdownConfig {
  gracefulTimeout: number;
  forceKillTimeout: number;
  shutdownOrder: ServiceName[];
}

const DEFAULT_CONFIG: ShutdownConfig = {
  gracefulTimeout: 10000,
  forceKillTimeout: 5000,
  shutdownOrder: [ServiceName.NGINX, ServiceName.FRONTEND, ServiceName.GATEWAY, ServiceName.LANGGRAPH]
};

export type StopServiceFn = (name: ServiceName) => Promise<void>;

export class GracefulShutdown {
  private logger: Logger;
  private config: ShutdownConfig;
  private isShuttingDown: boolean = false;
  private stopServiceFn?: StopServiceFn;
  private shutdownPromise?: Promise<void>;

  constructor(config: Partial<ShutdownConfig> = {}) {
    this.logger = getLogger('Shutdown');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setStopServiceFn(fn: StopServiceFn): void {
    this.stopServiceFn = fn;
  }

  setupSignalHandlers(): void {
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    
    if (process.platform === 'win32') {
      process.on('SIGBREAK', () => this.handleShutdown('SIGBREAK'));
    }

    process.on('SIGUSR1', () => {});
    process.on('SIGUSR2', () => {});

    this.logger.debug('Signal handlers registered');
  }

  private async handleShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.debug('Already shutting down, ignoring signal');
      return;
    }

    this.isShuttingDown = true;
    this.logger.info(`收到关闭信号 ${signal}，开始优雅关闭...`);

    if (this.shutdownPromise) {
      await this.shutdownPromise;
      return;
    }

    this.shutdownPromise = this.executeShutdown();

    const timeout = this.config.gracefulTimeout + this.config.forceKillTimeout + 2000;
    
    const forceExit = setTimeout(() => {
      this.logger.error('强制退出超时，立即终止');
      process.exit(1);
    }, timeout);

    await this.shutdownPromise;
    clearTimeout(forceExit);
    
    this.logger.info('所有服务已停止，退出码: 0');
    await new Promise(resolve => setTimeout(resolve, 100));
    process.exit(0);
  }

  private async executeShutdown(): Promise<void> {
    if (!this.stopServiceFn) {
      this.logger.warn('No stop service function registered');
      return;
    }

    const results: ShutdownResult[] = [];

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

    const successCount = results.filter(r => r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    
    this.logger.info(`关闭完成: ${successCount}/${results.length} 服务成功 (总耗时: ${totalDuration}ms)`);
  }

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

  isInShutdown(): boolean {
    return this.isShuttingDown;
  }
}
