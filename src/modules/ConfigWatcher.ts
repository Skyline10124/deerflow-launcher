import * as fs from 'fs';
import * as path from 'path';
import { Logger, getLogger } from './Logger';

export interface ConfigChange {
  file: string;
  event: 'change' | 'rename';
  timestamp: Date;
}

export interface WatchConfig {
  debounceMs: number;
  files: string[];
}

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

export type ConfigChangeHandler = (change: ConfigChange) => void;

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

  start(): void {
    this.logger.info('Starting config watcher...');

    for (const file of this.config.files) {
      this.watchFile(file);
    }
  }

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

  onChange(handler: ConfigChangeHandler): void {
    this.handlers.push(handler);
  }

  removeHandler(handler: ConfigChangeHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index > -1) {
      this.handlers.splice(index, 1);
    }
  }

  getWatchedFiles(): string[] {
    return Array.from(this.watchers.keys());
  }

  isWatching(file: string): boolean {
    return this.watchers.has(file);
  }

  addFile(relativePath: string): boolean {
    if (this.watchers.has(relativePath)) {
      return false;
    }

    this.watchFile(relativePath);
    return this.watchers.has(relativePath);
  }

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
