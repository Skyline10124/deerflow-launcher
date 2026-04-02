import * as path from 'path';
import { Logger, getLogger, setDefaultLogger, LogLevel } from '../modules/Logger';
import { EnvChecker } from '../modules/EnvChecker';
import { ConfigInitializer } from '../modules/ConfigInitializer';
import { ProcessManager } from '../modules/ProcessManager';
import { ProcessMonitor } from '../modules/ProcessMonitor';
import { ConfigWatcher, ConfigChange } from '../modules/ConfigWatcher';
import {
  LaunchContext,
  LaunchResult,
  LaunchStatus,
  ServiceInstance,
  ServiceName,
  ServiceStatus
} from '../types';
import {
  createLaunchContext,
  setLaunchStatus,
  updateServiceStatus,
  getAllServices,
  getElapsedSeconds,
  formatDuration
} from './LaunchContext';
import { getServiceDefinitions, SERVICE_START_ORDER } from '../config/services';
import { LauncherException, createEnvError, createStartError, createConfigError } from '../utils/errors';
import { getPackageVersion } from '../utils/version';

/** Launcher 配置选项 */
export interface LauncherOptions {
  deerflowPath: string;
  logDir?: string;
  logLevel?: LogLevel;
}

/**
 * DeerFlow 启动器
 * 负责环境检查、配置初始化和服务启动的完整生命周期管理
 */
export class Launcher {
  private logger: Logger;
  private envChecker: EnvChecker;
  private configInitializer: ConfigInitializer;
  private processManager: ProcessManager;
  private processMonitor: ProcessMonitor;
  private configWatcher: ConfigWatcher;
  private context: LaunchContext;
  private isStopping: boolean = false;
  private isCleaningUp: boolean = false;

  constructor(options: LauncherOptions) {
    const logDir = options.logDir ?? path.join(process.cwd(), 'logs');
    
    this.logger = getLogger('Launcher', {
      level: options.logLevel ?? LogLevel.INFO,
      logDir
    });
    
    setDefaultLogger(this.logger);

    this.context = createLaunchContext(options.deerflowPath, logDir);
    this.envChecker = new EnvChecker();
    this.configInitializer = new ConfigInitializer(options.deerflowPath, logDir);
    this.processManager = new ProcessManager(logDir, options.deerflowPath);
    this.processMonitor = new ProcessMonitor();
    this.configWatcher = new ConfigWatcher(options.deerflowPath);
  }

  /**
   * 启动 DeerFlow
   * 按顺序执行环境检查、配置初始化和服务启动
   */
  async start(): Promise<LaunchResult> {
    this.logger.info(`DeerFlow Launcher v${getPackageVersion()}`);
    this.logger.info(`DeerFlow Path: ${this.context.deerflowPath}`);
    this.logger.info('');

    try {
      setLaunchStatus(this.context, LaunchStatus.CHECKING_ENV);
      await this.checkEnvironment();

      setLaunchStatus(this.context, LaunchStatus.INIT_CONFIG);
      await this.initializeConfig();

      setLaunchStatus(this.context, LaunchStatus.STARTING_SERVICES);
      await this.startServices();

      setLaunchStatus(this.context, LaunchStatus.READY);
      return this.buildSuccessResult();
    } catch (error) {
      setLaunchStatus(this.context, LaunchStatus.FAILED);
      
      if (error instanceof LauncherException) {
        this.logger.error(error.message);
        if (error.suggestion) {
          this.logger.info(`Suggestion: ${error.suggestion}`);
        }
      } else {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Launch failed: ${errorMsg}`);
      }

      await this.cleanup();
      
      return this.buildFailureResult(error);
    }
  }

  /** 第一阶段: 检查环境依赖 */
  private async checkEnvironment(): Promise<void> {
    this.logger.info('=== Phase 1: Environment Check ===');
    
    const result = await this.envChecker.check();
    
    if (!result.success) {
      throw createEnvError(result.missing);
    }
    
    this.logger.info('');
  }

  /** 第二阶段: 初始化配置文件 */
  private async initializeConfig(): Promise<void> {
    this.logger.info('=== Phase 2: Configuration Initialization ===');
    
    if (!this.configInitializer.validateDeerFlowPath()) {
      throw createConfigError('CFG_INVALID_PATH', this.context.deerflowPath);
    }

    const result = await this.configInitializer.initialize();
    
    if (!result.success) {
      throw createConfigError(
        'CFG_CREATE_FAILED', 
        this.context.deerflowPath,
        `Failed files: ${result.failed.join(', ')}`
      );
    }
    
    this.logger.info('');
  }

  /** 第三阶段: 启动所有服务 */
  private async startServices(): Promise<void> {
    this.logger.info('=== Phase 3: Service Startup ===');
    
    await this.processManager.connect();
    
    const serviceDefinitions = getServiceDefinitions(this.context.deerflowPath);
    
    for (const serviceName of SERVICE_START_ORDER) {
      const definition = serviceDefinitions.find((d) => d.name === serviceName);
      if (!definition) {
        this.logger.error(`Service definition not found for ${serviceName}`);
        continue;
      }

      try {
        const instance = await this.processManager.startService(
          definition,
          this.context.services
        );
        
        updateServiceStatus(this.context, serviceName, instance.status, {
          pid: instance.pid,
          startTime: instance.startTime,
          healthCheckDuration: instance.healthCheckDuration,
          error: instance.error
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        updateServiceStatus(this.context, serviceName, ServiceStatus.FAILED, {
          error: errorMsg
        });
        
        throw createStartError(serviceName, errorMsg);
      }
    }
    
    await this.processMonitor.connect();
    this.processMonitor.startMonitoring(SERVICE_START_ORDER);
    this.processMonitor.onError((serviceName, error) => {
      this.logger.error(`Service ${serviceName} error: ${error.message}`);
    });
    
    this.configWatcher.onChange((change: ConfigChange) => {
      this.logger.info(`Config file changed: ${change.file}`);
    });
    this.configWatcher.start();
    
    this.logger.info('');
  }

  /** 停止 DeerFlow 并清理资源 */
  async stop(): Promise<void> {
    if (this.isStopping) {
      return;
    }
    this.isStopping = true;
    
    this.logger.info('Stopping DeerFlow...');
    setLaunchStatus(this.context, LaunchStatus.SHUTTING_DOWN);
    
    await this.cleanup();
    
    this.logger.info('DeerFlow stopped');
  }

  /** 清理所有资源 (停止监控、断开连接、停止服务) */
  private async cleanup(): Promise<void> {
    if (this.isCleaningUp) {
      return;
    }
    this.isCleaningUp = true;
    
    this.logger.info('Starting cleanup...');
    
    try {
      this.configWatcher.stop();
      this.processMonitor.stopMonitoring();
      
      try {
        await this.processMonitor.disconnect();
      } catch {}
      
      await this.processManager.stopAll(this.context.services);
      this.processManager.forceDisconnect();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cleanup error: ${errorMsg}`);
      this.processManager.forceDisconnect();
    }
    
    this.logger.info('Cleanup completed');
  }

  /** 构建成功结果 */
  private buildSuccessResult(): LaunchResult {
    const duration = getElapsedSeconds(this.context);
    
    this.logger.success(`All services are ready! (total: ${formatDuration(duration)})`);
    this.logger.info('Access DeerFlow at http://localhost:2026');
    
    return {
      success: true,
      status: this.context.status,
      services: getAllServices(this.context),
      totalDuration: duration
    };
  }

  /** 构建失败结果 */
  private buildFailureResult(error: unknown): LaunchResult {
    const duration = getElapsedSeconds(this.context);
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    return {
      success: false,
      status: this.context.status,
      services: getAllServices(this.context),
      totalDuration: duration,
      error: errorMsg
    };
  }

  /** 获取启动上下文 */
  getContext(): LaunchContext {
    return this.context;
  }

  /** 获取指定服务的状态 */
  getServiceStatus(serviceName: ServiceName): ServiceInstance | undefined {
    return this.context.services.get(serviceName);
  }

  printStatus(): void {
    this.logger.info('=== Current Status ===');
    this.logger.info(`Status: ${this.context.status}`);
    this.logger.info(`Elapsed: ${formatDuration(getElapsedSeconds(this.context))}`);
    this.logger.info('Services:');
    
    for (const service of getAllServices(this.context)) {
      const statusIcon = service.status === ServiceStatus.HEALTHY ? '✓' :
                         service.status === ServiceStatus.FAILED ? '✗' :
                         service.status === ServiceStatus.STARTING ? '⏳' : '○';
      this.logger.info(`  ${statusIcon} ${service.name}: ${service.status} (port ${service.port})`);
    }
    
    this.logger.info('=====================');
  }
}
