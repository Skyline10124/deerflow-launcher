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
import { Logger, getLogger } from './Logger.js';
import { 
  UnifiedLogEntry, 
  UnifiedLogLevel, 
  LogServiceName, 
  logParserRegistry 
} from './LogParser.js';

export interface LogFilter {
  service?: LogServiceName;
  level?: UnifiedLogLevel;
  since?: Date;
  until?: Date;
  search?: string;
  lines?: number;
}

export interface LogStats {
  file: string;
  size: number;
  lines: number;
  modified: Date;
}

export class LogManager {
  private logger: Logger;
  private logDir: string;

  constructor(logDir: string) {
    this.logger = getLogger('LogManager');
    this.logDir = logDir;
  }

  getLogFilePath(service: LogServiceName): string {
    return path.join(this.logDir, `${service}.log`);
  }

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
        lines: 0,
        modified: stats.mtime
      };
    });
  }

  readLogs(filter: LogFilter = {}): UnifiedLogEntry[] {
    const serviceName = filter.service || 'launcher';
    const logFile = this.getLogFilePath(serviceName);
    
    if (!fs.existsSync(logFile)) {
      return [];
    }

    const content = fs.readFileSync(logFile, 'utf-8');
    let lines = content.split('\n').filter(l => l.trim());

    if (filter.lines) {
      lines = lines.slice(-filter.lines);
    }

    let entries = lines.map(line => logParserRegistry.parse(line, serviceName));

    if (filter.level) {
      entries = entries.filter(e => e.level === filter.level);
    }

    const since = filter.since;
    if (since) {
      entries = entries.filter(e => e.timestamp >= since);
    }

    const until = filter.until;
    if (until) {
      entries = entries.filter(e => e.timestamp <= until);
    }

    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      entries = entries.filter(e => 
        e.message.toLowerCase().includes(searchLower) ||
        (e.source && e.source.toLowerCase().includes(searchLower))
      );
    }

    return entries;
  }

  tail(service: LogServiceName, lines: number = 20): UnifiedLogEntry[] {
    return this.readLogs({ service, lines });
  }

  follow(service: LogServiceName, callback: (entry: UnifiedLogEntry) => void): () => void {
    const logFile = this.getLogFilePath(service);
    let lastSize = 0;
    let lastPosition = 0;

    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      lastSize = stats.size;
      lastPosition = stats.size;
    }

    const interval = setInterval(() => {
      if (!fs.existsSync(logFile)) return;

      const stats = fs.statSync(logFile);
      
      if (stats.size < lastSize) {
        lastSize = 0;
        lastPosition = 0;
      }
      
      if (stats.size > lastSize) {
        const fd = fs.openSync(logFile, 'r');
        const buffer = Buffer.alloc(stats.size - lastPosition);
        fs.readSync(fd, buffer, 0, buffer.length, lastPosition);
        fs.closeSync(fd);

        const newContent = buffer.toString('utf-8');
        const newLines = newContent.split('\n').filter(l => l.trim());

        for (const line of newLines) {
          const entry = logParserRegistry.parse(line, service);
          callback(entry);
        }

        lastPosition = stats.size;
        lastSize = stats.size;
      }
    }, 500);

    return () => clearInterval(interval);
  }

  clearLogs(service?: LogServiceName): void {
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

  getLogSize(service?: LogServiceName): number {
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

  formatEntries(entries: UnifiedLogEntry[], format: 'text' | 'json' = 'text'): string {
    if (format === 'json') {
      return JSON.stringify(entries, null, 2);
    }

    return entries.map(e => e.raw).join('\n');
  }

  printTail(service: LogServiceName, lines: number = 20): void {
    const entries = this.tail(service, lines);
    
    console.log(`\n=== ${service} 日志 (最近 ${lines} 行) ===\n`);
    
    for (const entry of entries) {
      let prefix = '';
      switch (entry.level) {
        case UnifiedLogLevel.ERROR: prefix = '\x1b[31m'; break;
        case UnifiedLogLevel.WARN: prefix = '\x1b[33m'; break;
        case UnifiedLogLevel.DEBUG: prefix = '\x1b[90m'; break;
        default: prefix = '\x1b[34m';
      }
      console.log(`${prefix}${entry.raw}\x1b[0m`);
    }
    
    console.log('');
  }
}
