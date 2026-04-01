/**
 * 日志管理模块
 * Log Manager Module
 * 
 * 提供日志文件的读取、过滤、搜索和监控功能
 * Provides log file reading, filtering, searching, and monitoring functionality
 * 
 * 主要功能 / Key Features:
 * - 日志文件读取 / Log file reading
 * - 多条件过滤 / Multi-condition filtering
 * - 实时日志跟踪 / Real-time log following
 * - 日志统计 / Log statistics
 * 
 * @module LogManager
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger, getLogger } from './Logger';
import { ServiceName } from '../types';

/**
 * 日志条目
 * Log Entry
 */
export interface LogEntry {
  /** 时间戳 / Timestamp */
  timestamp: string;
  /** 日志级别 / Log level */
  level: string;
  /** 模块名称 / Module name */
  module: string;
  /** 日志消息 / Log message */
  message: string;
  /** 原始行内容 / Raw line content */
  raw: string;
}

/**
 * 日志过滤条件
 * Log Filter Conditions
 */
export interface LogFilter {
  /** 服务名称 / Service name */
  service?: ServiceName | 'launcher';
  /** 日志级别 / Log level */
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  /** 起始时间 / Start time */
  since?: Date;
  /** 结束时间 / End time */
  until?: Date;
  /** 搜索关键词 / Search keyword */
  search?: string;
  /** 返回行数限制 / Line limit */
  lines?: number;
}

/**
 * 日志文件统计信息
 * Log File Statistics
 */
export interface LogStats {
  /** 文件名 / File name */
  file: string;
  /** 文件大小 (字节) / File size in bytes */
  size: number;
  /** 行数 / Line count */
  lines: number;
  /** 最后修改时间 / Last modified time */
  modified: Date;
}

/**
 * 日志管理器
 * Log Manager
 * 
 * 管理服务日志的读取、过滤和监控
 * Manages service log reading, filtering, and monitoring
 */
export class LogManager {
  /** 日志记录器 / Logger instance */
  private logger: Logger;
  /** 日志目录 / Log directory */
  private logDir: string;

  /**
   * 创建日志管理器
   * Create log manager
   * 
   * @param logDir - 日志目录路径 / Log directory path
   */
  constructor(logDir: string) {
    this.logger = getLogger('LogManager');
    this.logDir = logDir;
  }

  /**
   * 获取日志文件路径
   * Get log file path
   * 
   * @param service - 服务名称 / Service name
   * @returns 日志文件完整路径 / Full log file path
   */
  getLogFilePath(service: ServiceName | 'launcher'): string {
    return path.join(this.logDir, `${service}.log`);
  }

  /**
   * 列出所有日志文件
   * List all log files
   * 
   * @returns 日志文件统计列表 / List of log file statistics
   */
  listLogFiles(): LogStats[] {
    if (!fs.existsSync(this.logDir)) {
      return [];
    }

    const files = fs.readdirSync(this.logDir)
      .filter(f => f.endsWith('.log'));

    return files.map(f => {
      const filePath = path.join(this.logDir, f);
      const stats = fs.statSync(filePath);
      
      return {
        file: f,
        size: stats.size,
        lines: 0, // 优化: 移除同步行数统计 / Optimization: Removed synchronous line counting
        modified: stats.mtime
      };
    });
  }

  /**
   * 读取日志
   * Read logs
   * 
   * 根据过滤条件读取日志条目
   * Reads log entries based on filter conditions
   * 
   * @param filter - 过滤条件 / Filter conditions
   * @returns 日志条目数组 / Array of log entries
   */
  readLogs(filter: LogFilter = {}): LogEntry[] {
    const serviceName = filter.service || 'launcher';
    const logFile = this.getLogFilePath(serviceName);
    
    if (!fs.existsSync(logFile)) {
      return [];
    }

    const content = fs.readFileSync(logFile, 'utf-8');
    let lines = content.split('\n').filter(l => l.trim());

    // 限制行数 / Limit lines
    if (filter.lines) {
      lines = lines.slice(-filter.lines);
    }

    let entries = lines.map(line => this.parseLine(line));

    // 按级别过滤 / Filter by level
    if (filter.level) {
      entries = entries.filter(e => e.level === filter.level);
    }

    // 按起始时间过滤 / Filter by start time
    if (filter.since) {
      const since = filter.since;
      entries = entries.filter(e => new Date(e.timestamp) >= since);
    }

    // 按结束时间过滤 / Filter by end time
    if (filter.until) {
      const until = filter.until;
      entries = entries.filter(e => new Date(e.timestamp) <= until);
    }

    // 按关键词搜索 / Search by keyword
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      entries = entries.filter(e => 
        e.message.toLowerCase().includes(searchLower) ||
        e.module.toLowerCase().includes(searchLower)
      );
    }

    return entries;
  }

  /**
   * 解析日志行
   * Parse log line
   * 
   * @param line - 原始日志行 / Raw log line
   * @returns 解析后的日志条目 / Parsed log entry
   */
  private parseLine(line: string): LogEntry {
    // 日志格式: [timestamp] [level] [module] message
    const pattern = /^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/;
    const match = line.match(pattern);

    if (match) {
      return {
        timestamp: match[1],
        level: match[2],
        module: match[3],
        message: match[4],
        raw: line
      };
    }

    // 无法解析的行返回原始内容 / Return raw content for unparseable lines
    return {
      timestamp: '',
      level: 'INFO',
      module: '',
      message: line,
      raw: line
    };
  }

  /**
   * 获取最近的日志
   * Get recent logs (tail)
   * 
   * @param service - 服务名称 / Service name
   * @param lines - 行数 / Number of lines
   * @returns 日志条目数组 / Array of log entries
   */
  tail(service: ServiceName | 'launcher', lines: number = 20): LogEntry[] {
    return this.readLogs({ service, lines });
  }

  /**
   * 实时跟踪日志
   * Follow logs in real-time
   * 
   * @param service - 服务名称 / Service name
   * @param callback - 新日志回调函数 / Callback for new log entries
   * @returns 取消跟踪函数 / Function to stop following
   */
  follow(service: ServiceName | 'launcher', callback: (entry: LogEntry) => void): () => void {
    const logFile = this.getLogFilePath(service);
    let lastSize = 0;
    let lastPosition = 0;

    // 初始化位置 / Initialize position
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      lastSize = stats.size;
      lastPosition = stats.size;
    }

    // 定时检查新内容 / Periodically check for new content
    const interval = setInterval(() => {
      if (!fs.existsSync(logFile)) return;

      const stats = fs.statSync(logFile);
      
      // 处理日志轮转 / Handle log rotation
      if (stats.size < lastSize) {
        lastSize = 0;
        lastPosition = 0;
      }
      
      // 读取新增内容 / Read new content
      if (stats.size > lastSize) {
        const fd = fs.openSync(logFile, 'r');
        const buffer = Buffer.alloc(stats.size - lastPosition);
        fs.readSync(fd, buffer, 0, buffer.length, lastPosition);
        fs.closeSync(fd);

        const newContent = buffer.toString('utf-8');
        const newLines = newContent.split('\n').filter(l => l.trim());

        for (const line of newLines) {
          const entry = this.parseLine(line);
          callback(entry);
        }

        lastPosition = stats.size;
        lastSize = stats.size;
      }
    }, 500);

    // 返回取消函数 / Return cancel function
    return () => clearInterval(interval);
  }

  /**
   * 清除日志
   * Clear logs
   * 
   * @param service - 服务名称 (可选，不传则清除所有) / Service name (optional, clears all if not provided)
   */
  clearLogs(service?: ServiceName | 'launcher'): void {
    if (service) {
      const logFile = this.getLogFilePath(service);
      if (fs.existsSync(logFile)) {
        fs.writeFileSync(logFile, '');
        this.logger.info(`Cleared log: ${service}`);
      }
    } else {
      const files = this.listLogFiles();
      for (const f of files) {
        const filePath = path.join(this.logDir, f.file);
        fs.writeFileSync(filePath, '');
      }
      this.logger.info('Cleared all logs');
    }
  }

  /**
   * 获取日志大小
   * Get log size
   * 
   * @param service - 服务名称 (可选，不传则返回总大小) / Service name (optional, returns total size if not provided)
   * @returns 日志大小 (字节) / Log size in bytes
   */
  getLogSize(service?: ServiceName | 'launcher'): number {
    if (service) {
      const logFile = this.getLogFilePath(service);
      if (fs.existsSync(logFile)) {
        return fs.statSync(logFile).size;
      }
      return 0;
    }

    const files = this.listLogFiles();
    return files.reduce((sum, f) => sum + f.size, 0);
  }

  /**
   * 格式化日志条目
   * Format log entries
   * 
   * @param entries - 日志条目数组 / Array of log entries
   * @param format - 输出格式 / Output format
   * @returns 格式化后的字符串 / Formatted string
   */
  formatEntries(entries: LogEntry[], format: 'text' | 'json' = 'text'): string {
    if (format === 'json') {
      return JSON.stringify(entries, null, 2);
    }

    return entries.map(e => e.raw).join('\n');
  }

  /**
   * 打印最近的日志到控制台
   * Print recent logs to console
   * 
   * @param service - 服务名称 / Service name
   * @param lines - 行数 / Number of lines
   */
  printTail(service: ServiceName | 'launcher', lines: number = 20): void {
    const entries = this.tail(service, lines);
    
    console.log(`\n=== ${service} 日志 (最近 ${lines} 行) ===\n`);
    
    // 根据级别着色 / Colorize by level
    for (const entry of entries) {
      let prefix = '';
      switch (entry.level) {
        case 'ERROR': prefix = '\x1b[31m'; break;  // 红色 / Red
        case 'WARN': prefix = '\x1b[33m'; break;   // 黄色 / Yellow
        case 'DEBUG': prefix = '\x1b[90m'; break;  // 灰色 / Gray
        default: prefix = '\x1b[34m';              // 蓝色 / Blue
      }
      console.log(`${prefix}${entry.raw}\x1b[0m`);
    }
    
    console.log('');
  }
}
