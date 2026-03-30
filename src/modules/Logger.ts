import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

export interface LoggerOptions {
  level?: LogLevel;
  logDir?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
  maxSize?: string;
  maxFiles?: number;
}

export interface LogRotationConfig {
  maxSize: number;
  maxFiles: number;
}

const DEFAULT_ROTATION: LogRotationConfig = {
  maxSize: 10 * 1024 * 1024,
  maxFiles: 5
};

export class Logger {
  private module: string;
  private level: LogLevel;
  private logDir: string;
  private enableConsole: boolean;
  private enableFile: boolean;
  private logFile: string | null = null;
  private rotationConfig: LogRotationConfig;
  private lastRotationCheck: number = 0;

  constructor(module: string, options: LoggerOptions = {}) {
    this.module = module;
    this.level = options.level ?? LogLevel.INFO;
    this.logDir = options.logDir ?? path.join(process.cwd(), 'logs');
    this.enableConsole = options.enableConsole ?? true;
    this.enableFile = options.enableFile ?? true;
    this.rotationConfig = {
      maxSize: this.parseSize(options.maxSize || '10m'),
      maxFiles: options.maxFiles ?? 5
    };

    if (this.enableFile) {
      this.initLogFile();
    }
  }

  private parseSize(size: string): number {
    const match = size.match(/^(\d+)(k|m|g)?$/i);
    if (!match) return 10 * 1024 * 1024;
    
    const num = parseInt(match[1], 10);
    const unit = (match[2] || '').toLowerCase();
    
    switch (unit) {
      case 'k': return num * 1024;
      case 'm': return num * 1024 * 1024;
      case 'g': return num * 1024 * 1024 * 1024;
      default: return num;
    }
  }

  private initLogFile(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.logFile = path.join(this.logDir, 'launcher.log');
    
    if (!fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, '');
    }
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = this.formatTimestamp();
    return `[${timestamp}] [${level}] [${this.module}] ${message}`;
  }

  private writeToFile(formattedMessage: string): void {
    if (this.logFile) {
      this.checkRotation();
      fs.appendFileSync(this.logFile, formattedMessage + '\n');
    }
  }

  private checkRotation(): void {
    const now = Date.now();
    if (now - this.lastRotationCheck < 10000) {
      return;
    }
    this.lastRotationCheck = now;

    try {
      const stats = fs.statSync(this.logFile!);
      if (stats.size >= this.rotationConfig.maxSize) {
        this.rotateLog();
      }
    } catch {
      // Ignore errors
    }
  }

  private rotateLog(): void {
    if (!this.logFile) return;

    const dir = path.dirname(this.logFile);
    const baseName = path.basename(this.logFile, '.log');
    const ext = '.log';

    for (let i = this.rotationConfig.maxFiles - 1; i >= 1; i--) {
      const oldFile = path.join(dir, `${baseName}-${i}${ext}`);
      const newFile = path.join(dir, `${baseName}-${i + 1}${ext}`);
      
      if (fs.existsSync(oldFile)) {
        if (i === this.rotationConfig.maxFiles - 1) {
          fs.unlinkSync(oldFile);
        } else {
          fs.renameSync(oldFile, newFile);
        }
      }
    }

    const firstBackup = path.join(dir, `${baseName}-1${ext}`);
    fs.renameSync(this.logFile, firstBackup);
    fs.writeFileSync(this.logFile, '');
  }

  cleanOldLogs(): void {
    if (!this.logFile) return;

    const dir = path.dirname(this.logFile);
    const baseName = path.basename(this.logFile, '.log');
    
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith(baseName) && f.endsWith('.log'))
      .sort()
      .reverse();

    for (let i = this.rotationConfig.maxFiles; i < files.length; i++) {
      const fileToDelete = path.join(dir, files[i]);
      try {
        fs.unlinkSync(fileToDelete);
      } catch {
        // Ignore errors
      }
    }
  }

  debug(message: string): void {
    if (this.level <= LogLevel.DEBUG) {
      const formatted = this.formatMessage('DEBUG', message);
      if (this.enableConsole) {
        console.log(chalk.gray(formatted));
      }
      this.writeToFile(formatted);
    }
  }

  info(message: string): void {
    if (this.level <= LogLevel.INFO) {
      const formatted = this.formatMessage('INFO', message);
      if (this.enableConsole) {
        console.log(chalk.blue(formatted));
      }
      this.writeToFile(formatted);
    }
  }

  warn(message: string): void {
    if (this.level <= LogLevel.WARN) {
      const formatted = this.formatMessage('WARN', message);
      if (this.enableConsole) {
        console.log(chalk.yellow(formatted));
      }
      this.writeToFile(formatted);
    }
  }

  error(message: string, error?: Error): void {
    if (this.level <= LogLevel.ERROR) {
      const formatted = this.formatMessage('ERROR', message);
      if (this.enableConsole) {
        console.log(chalk.red(formatted));
      }
      this.writeToFile(formatted);
      
      if (error?.stack) {
        const stackLine = this.formatMessage('ERROR', `Stack: ${error.stack}`);
        this.writeToFile(stackLine);
      }
    }
  }

  success(message: string): void {
    if (this.level <= LogLevel.INFO) {
      const formatted = this.formatMessage('INFO', message);
      if (this.enableConsole) {
        console.log(chalk.green(formatted));
      }
      this.writeToFile(formatted);
    }
  }

  close(): void {
    // No-op for synchronous file writing
  }

  getLogFile(): string | null {
    return this.logFile;
  }

  getLogSize(): number {
    if (!this.logFile || !fs.existsSync(this.logFile)) return 0;
    return fs.statSync(this.logFile).size;
  }
}

let defaultLogger: Logger | null = null;

export function getLogger(module: string, options?: LoggerOptions): Logger {
  return new Logger(module, options);
}

export function getDefaultLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger('Launcher');
  }
  return defaultLogger;
}

export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger;
}

export function parseLogLevel(level?: string): LogLevel {
  switch (level?.toLowerCase()) {
    case 'debug':
      return LogLevel.DEBUG;
    case 'warn':
    case 'warning':
      return LogLevel.WARN;
    case 'error':
      return LogLevel.ERROR;
    case 'silent':
      return LogLevel.SILENT;
    default:
      return LogLevel.INFO;
  }
}
