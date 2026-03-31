import * as fs from 'fs';
import * as path from 'path';
import { Logger, getLogger } from './Logger';

/** 配置变更事件 */
export interface ConfigChange {
  file: string;
  event: 'change' | 'rename';
  timestamp: Date;
}

/** 监控配置选项 */
export interface WatchConfig {
  debounceMs: number;
  files: string[];
}

/** 默认监控配置 */
const DEFAULT_CONFIG: WatchConfig = {
  debounceMs: 1000,
  files: [
    'config.yaml',
    '.env',
    'frontend/.env',
    'extensions_config.json',
    'nginx.conf'
  ]
};

/** 配置变更处理器类型 */
export type ConfigChangeHandler = (change: ConfigChange) => void;

/**
 * 配置文件监控器
 * 监控 DeerFlow 配置文件的变化并触发回调
 */
export class ConfigWatcher {
  private logger: Logger;
  private deerflowPath: string;
  private config: WatchConfig;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private handlers: ConfigChangeHandler[] = [];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private lastContent: Map<string, string> = new Map();

  constructor(deerflowPath: string, config: Partial<WatchConfig> = {}) {
    this.logger = getLogger('CfgWatcher');
    this.deerflowPath = deerflowPath;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 启动配置文件监控 */
  start(): void {
    this.logger.info('Starting config watcher...');

    for (const file of this.config.files) {
      this.watchFile(file);
    }
  }

  /** 停止配置文件监控 */
  stop(): void {
    this.logger.info('Stopping config watcher...');

    for (const [file, watcher] of this.watchers) {
      watcher.close();
      this.logger.debug(`Stopped watching: ${file}`);
    }

    this.watchers.clear();

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /** 监控单个配置文件 */
  private watchFile(relativePath: string): void {
    const filePath = path.join(this.deerflowPath, relativePath);

    if (!fs.existsSync(filePath)) {
      this.logger.debug(`Config file not found, skipping: ${relativePath}`);
      return;
    }

    try {
      this.lastContent.set(relativePath, fs.readFileSync(filePath, 'utf-8'));

      const watcher = fs.watch(filePath, (event) => {
        this.handleFileEvent(relativePath, event);
      });

      watcher.on('error', (error) => {
        this.logger.error(`Watcher error for ${relativePath}: ${error.message}`);
      });

      this.watchers.set(relativePath, watcher);
      this.logger.debug(`Watching: ${relativePath}`);
    } catch (error) {
      this.logger.error(`Failed to watch ${relativePath}: ${error}`);
    }
  }

  /** 处理文件事件 (带防抖) */
  private handleFileEvent(relativePath: string, event: string): void {
    const existingTimer = this.debounceTimers.get(relativePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.processChange(relativePath, event as 'change' | 'rename');
      this.debounceTimers.delete(relativePath);
    }, this.config.debounceMs);

    this.debounceTimers.set(relativePath, timer);
  }

  /** 处理配置变更 (检测内容是否真正改变) */
  private processChange(relativePath: string, event: 'change' | 'rename'): void {
    const filePath = path.join(this.deerflowPath, relativePath);

    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Config file deleted: ${relativePath}`);
      return;
    }

    try {
      const newContent = fs.readFileSync(filePath, 'utf-8');
      const oldContent = this.lastContent.get(relativePath) || '';

      if (newContent === oldContent) {
        return;
      }

      this.lastContent.set(relativePath, newContent);

      const change: ConfigChange = {
        file: relativePath,
        event,
        timestamp: new Date()
      };

      this.logger.info(`Config changed: ${relativePath}`);

      for (const handler of this.handlers) {
        try {
          handler(change);
        } catch (error) {
          this.logger.error(`Handler error: ${error}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error processing change for ${relativePath}: ${error}`);
    }
  }

  /** 注册配置变更处理器 */
  onChange(handler: ConfigChangeHandler): void {
    this.handlers.push(handler);
  }

  /** 移除配置变更处理器 */
  removeHandler(handler: ConfigChangeHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index > -1) {
      this.handlers.splice(index, 1);
    }
  }

  /** 获取正在监控的文件列表 */
  getWatchedFiles(): string[] {
    return Array.from(this.watchers.keys());
  }

  /** 检查是否正在监控指定文件 */
  isWatching(file: string): boolean {
    return this.watchers.has(file);
  }

  /** 添加文件到监控列表 */
  addFile(relativePath: string): boolean {
    if (this.watchers.has(relativePath)) {
      return false;
    }

    this.watchFile(relativePath);
    return this.watchers.has(relativePath);
  }

  /** 从监控列表移除文件 */
  removeFile(relativePath: string): boolean {
    const watcher = this.watchers.get(relativePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(relativePath);
      this.lastContent.delete(relativePath);
      
      const timer = this.debounceTimers.get(relativePath);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(relativePath);
      }
      
      return true;
    }
    return false;
  }
}
