import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
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
    this.level = options.level ?? LogLevel.DEBUG;
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

    const date = new Date().toISOString().split('T')[0];
    this.logFile = path.join(this.logDir, `launcher-${date}.log`);
    
    if (!fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, '');
    }
  }

  private formatTimestamp(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
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

  error(message: string): void {
    if (this.level <= LogLevel.ERROR) {
      const formatted = this.formatMessage('ERROR', message);
      if (this.enableConsole) {
        console.log(chalk.red(formatted));
      }
      this.writeToFile(formatted);
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
