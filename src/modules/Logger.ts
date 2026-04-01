/**
 * 日志记录器模块
 * Logger Module
 * 
 * 提供统一的日志记录功能，支持控制台输出和文件写入
 * Provides unified logging functionality with console output and file writing
 * 
 * 主要功能 / Key Features:
 * - 多级别日志 (DEBUG, INFO, WARN, ERROR) / Multi-level logging
 * - 控制台彩色输出 / Colored console output
 * - 文件日志轮转 / File log rotation
 * - 模块化日志 / Modular logging
 * 
 * @module Logger
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';

/**
 * 检测是否运行在 pkg 打包环境中
 * Check if running in pkg packaged environment
 */
function isPkgEnvironment(): boolean {
  return typeof (process as unknown as Record<string, unknown>).pkg !== 'undefined';
}

/**
 * 获取默认日志目录
 * Get default log directory
 * 
 * pkg 环境使用 ~/.deerflow/logs，开发环境使用 cwd/logs
 * Uses ~/.deerflow/logs in pkg, cwd/logs in development
 */
function getDefaultLogDir(): string {
  if (isPkgEnvironment()) {
    return path.join(os.homedir(), '.deerflow', 'logs');
  }
  return path.join(process.cwd(), 'logs');
}

/**
 * 日志级别枚举
 * Log Level Enum
 */
export enum LogLevel {
  /** 调试级别 / Debug level */
  DEBUG = 0,
  /** 信息级别 / Info level */
  INFO = 1,
  /** 警告级别 / Warning level */
  WARN = 2,
  /** 错误级别 / Error level */
  ERROR = 3,
  /** 静默 (不输出) / Silent (no output) */
  SILENT = 4
}

/**
 * 日志记录器配置选项
 * Logger Options
 */
export interface LoggerOptions {
  /** 日志级别 / Log level */
  level?: LogLevel;
  /** 日志目录 / Log directory */
  logDir?: string;
  /** 是否启用控制台输出 / Enable console output */
  enableConsole?: boolean;
  /** 是否启用文件输出 / Enable file output */
  enableFile?: boolean;
  /** 最大文件大小 (如 '10m', '100k') / Max file size */
  maxSize?: string;
  /** 最大保留文件数 / Max number of files to keep */
  maxFiles?: number;
}

/**
 * 日志轮转配置
 * Log Rotation Configuration
 */
export interface LogRotationConfig {
  /** 最大文件大小 (字节) / Max file size in bytes */
  maxSize: number;
  /** 最大保留文件数 / Max number of files to keep */
  maxFiles: number;
}

/**
 * 日志记录器类
 * Logger Class
 * 
 * 提供模块化的日志记录功能
 * Provides modular logging functionality
 */
export class Logger {
  /** 模块名称 / Module name */
  private module: string;
  /** 日志级别 / Log level */
  private level: LogLevel;
  /** 日志目录 / Log directory */
  private logDir: string;
  /** 是否启用控制台输出 / Enable console output */
  private enableConsole: boolean;
  /** 是否启用文件输出 / Enable file output */
  private enableFile: boolean;
  /** 日志文件路径 / Log file path */
  private logFile: string | null = null;
  /** 日志轮转配置 / Log rotation config */
  private rotationConfig: LogRotationConfig;
  /** 上次轮转检查时间 / Last rotation check time */
  private lastRotationCheck: number = 0;

  /**
   * 创建日志记录器实例
   * Create logger instance
   * 
   * @param module - 模块名称 / Module name
   * @param options - 配置选项 / Configuration options
   */
  constructor(module: string, options: LoggerOptions = {}) {
    this.module = module;
    this.level = options.level ?? LogLevel.INFO;
    this.logDir = options.logDir ?? getDefaultLogDir();
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

  /**
   * 解析大小字符串
   * Parse size string
   * 
   * 支持格式: '10m', '100k', '1g'
   * Supported formats: '10m', '100k', '1g'
   * 
   * @param size - 大小字符串 / Size string
   * @returns 字节数 / Number of bytes
   */
  private parseSize(size: string): number {
    const match = size.match(/^(\d+)(k|m|g)?$/i);
    if (!match) return 10 * 1024 * 1024;  // 默认 10MB / Default 10MB
    
    const num = parseInt(match[1], 10);
    const unit = (match[2] || '').toLowerCase();
    
    switch (unit) {
      case 'k': return num * 1024;
      case 'm': return num * 1024 * 1024;
      case 'g': return num * 1024 * 1024 * 1024;
      default: return num;
    }
  }

  /**
   * 初始化日志文件
   * Initialize log file
   */
  private initLogFile(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.logFile = path.join(this.logDir, 'launcher.log');
    
    if (!fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, '');
    }
  }

  /**
   * 格式化时间戳
   * Format timestamp
   * 
   * @returns ISO 格式时间戳 / ISO format timestamp
   */
  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * 格式化日志消息
   * Format log message
   * 
   * @param level - 日志级别 / Log level
   * @param message - 日志消息 / Log message
   * @returns 格式化后的消息 / Formatted message
   */
  private formatMessage(level: string, message: string): string {
    const timestamp = this.formatTimestamp();
    return `[${timestamp}] [${level}] [${this.module}] ${message}`;
  }

  /**
   * 写入日志到文件
   * Write log to file
   * 
   * @param formattedMessage - 格式化后的消息 / Formatted message
   */
  private writeToFile(formattedMessage: string): void {
    if (this.logFile) {
      this.checkRotation();
      fs.appendFileSync(this.logFile, formattedMessage + '\n');
    }
  }

  /**
   * 检查是否需要日志轮转
   * Check if log rotation is needed
   */
  private checkRotation(): void {
    const now = Date.now();
    // 最多每 10 秒检查一次 / Check at most every 10 seconds
    if (now - this.lastRotationCheck < 10000) {
      return;
    }
    this.lastRotationCheck = now;

    if (!this.logFile) return;
    
    try {
      const stats = fs.statSync(this.logFile);
      if (stats.size >= this.rotationConfig.maxSize) {
        this.rotateLog();
      }
    } catch {
      // 忽略错误 / Ignore errors
    }
  }

  /**
   * 执行日志轮转
   * Perform log rotation
   */
  private rotateLog(): void {
    if (!this.logFile) return;

    const dir = path.dirname(this.logFile);
    const baseName = path.basename(this.logFile, '.log');
    const ext = '.log';

    // 重命名现有备份文件 / Rename existing backup files
    for (let i = this.rotationConfig.maxFiles - 1; i >= 1; i--) {
      const oldFile = path.join(dir, `${baseName}-${i}${ext}`);
      const newFile = path.join(dir, `${baseName}-${i + 1}${ext}`);
      
      if (fs.existsSync(oldFile)) {
        if (i === this.rotationConfig.maxFiles - 1) {
          // 删除最旧的备份 / Delete oldest backup
          fs.unlinkSync(oldFile);
        } else {
          fs.renameSync(oldFile, newFile);
        }
      }
    }

    // 重命名当前日志文件 / Rename current log file
    const firstBackup = path.join(dir, `${baseName}-1${ext}`);
    fs.renameSync(this.logFile, firstBackup);
    fs.writeFileSync(this.logFile, '');
  }

  /**
   * 清理旧日志文件
   * Clean old log files
   */
  cleanOldLogs(): void {
    if (!this.logFile) return;

    const dir = path.dirname(this.logFile);
    const baseName = path.basename(this.logFile, '.log');
    
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith(baseName) && f.endsWith('.log'))
      .sort()
      .reverse();

    // 删除超出数量限制的文件 / Delete files exceeding limit
    for (let i = this.rotationConfig.maxFiles; i < files.length; i++) {
      const fileToDelete = path.join(dir, files[i]);
      try {
        fs.unlinkSync(fileToDelete);
      } catch {
        // 忽略错误 / Ignore errors
      }
    }
  }

  /**
   * 输出调试日志
   * Output debug log
   * 
   * @param message - 日志消息 / Log message
   */
  debug(message: string): void {
    if (this.level <= LogLevel.DEBUG) {
      const formatted = this.formatMessage('DEBUG', message);
      if (this.enableConsole) {
        console.log(chalk.gray(formatted));
      }
      this.writeToFile(formatted);
    }
  }

  /**
   * 输出信息日志
   * Output info log
   * 
   * @param message - 日志消息 / Log message
   */
  info(message: string): void {
    if (this.level <= LogLevel.INFO) {
      const formatted = this.formatMessage('INFO', message);
      if (this.enableConsole) {
        console.log(chalk.blue(formatted));
      }
      this.writeToFile(formatted);
    }
  }

  /**
   * 输出警告日志
   * Output warning log
   * 
   * @param message - 日志消息 / Log message
   */
  warn(message: string): void {
    if (this.level <= LogLevel.WARN) {
      const formatted = this.formatMessage('WARN', message);
      if (this.enableConsole) {
        console.log(chalk.yellow(formatted));
      }
      this.writeToFile(formatted);
    }
  }

  /**
   * 输出错误日志
   * Output error log
   * 
   * @param message - 日志消息 / Log message
   * @param error - 错误对象 (可选) / Error object (optional)
   */
  error(message: string, error?: Error): void {
    if (this.level <= LogLevel.ERROR) {
      const formatted = this.formatMessage('ERROR', message);
      if (this.enableConsole) {
        console.log(chalk.red(formatted));
      }
      this.writeToFile(formatted);
      
      // 写入错误堆栈 / Write error stack
      if (error?.stack) {
        const stackLine = this.formatMessage('ERROR', `Stack: ${error.stack}`);
        this.writeToFile(stackLine);
      }
    }
  }

  /**
   * 输出成功日志
   * Output success log
   * 
   * @param message - 日志消息 / Log message
   */
  success(message: string): void {
    if (this.level <= LogLevel.INFO) {
      const formatted = this.formatMessage('INFO', message);
      if (this.enableConsole) {
        console.log(chalk.green(formatted));
      }
      this.writeToFile(formatted);
    }
  }

  /**
   * 关闭日志记录器
   * Close logger
   * 
   * 同步文件写入模式下无需操作
   * No-op for synchronous file writing
   */
  close(): void {
    // 同步写入无需关闭 / No-op for synchronous writing
  }

  /**
   * 获取日志文件路径
   * Get log file path
   * 
   * @returns 日志文件路径或 null / Log file path or null
   */
  getLogFile(): string | null {
    return this.logFile;
  }

  /**
   * 获取日志文件大小
   * Get log file size
   * 
   * @returns 文件大小 (字节) / File size in bytes
   */
  getLogSize(): number {
    if (!this.logFile || !fs.existsSync(this.logFile)) return 0;
    return fs.statSync(this.logFile).size;
  }
}

/** 默认日志记录器 / Default logger instance */
let defaultLogger: Logger | null = null;

/**
 * 获取日志记录器
 * Get logger
 * 
 * 创建或返回指定模块的日志记录器
 * Creates or returns a logger for the specified module
 * 
 * @param module - 模块名称 / Module name
 * @param options - 配置选项 / Configuration options
 * @returns 日志记录器实例 / Logger instance
 */
export function getLogger(module: string, options?: LoggerOptions): Logger {
  return new Logger(module, options);
}

/**
 * 获取默认日志记录器
 * Get default logger
 * 
 * @returns 默认日志记录器实例 / Default logger instance
 */
export function getDefaultLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger('Launcher');
  }
  return defaultLogger;
}

/**
 * 设置默认日志记录器
 * Set default logger
 * 
 * @param logger - 日志记录器实例 / Logger instance
 */
export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger;
}

/**
 * 解析日志级别字符串
 * Parse log level string
 * 
 * @param level - 级别字符串 / Level string
 * @returns 日志级别枚举值 / Log level enum value
 */
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
