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
}

export class Logger {
  private module: string;
  private level: LogLevel;
  private logDir: string;
  private enableConsole: boolean;
  private enableFile: boolean;
  private logFile: string | null = null;

  constructor(module: string, options: LoggerOptions = {}) {
    this.module = module;
    this.level = options.level ?? LogLevel.INFO;
    this.logDir = options.logDir ?? path.join(process.cwd(), 'logs');
    this.enableConsole = options.enableConsole ?? true;
    this.enableFile = options.enableFile ?? true;

    if (this.enableFile) {
      this.initLogFile();
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
      fs.appendFileSync(this.logFile, formattedMessage + '\n');
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
