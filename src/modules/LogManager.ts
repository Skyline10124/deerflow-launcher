import * as fs from 'fs';
import * as path from 'path';
import { Logger, getLogger } from './Logger';
import { ServiceName } from '../types';

export interface LogEntry {
  timestamp: string;
  level: string;
  module: string;
  message: string;
  raw: string;
}

export interface LogFilter {
  service?: ServiceName | 'launcher';
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
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

  getLogFilePath(service: ServiceName | 'launcher'): string {
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
        lines: 0, // Optimization: Removed synchronous line counting
        modified: stats.mtime
      };
    });
  }

  readLogs(filter: LogFilter = {}): LogEntry[] {
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

    let entries = lines.map(line => this.parseLine(line));

    if (filter.level) {
      entries = entries.filter(e => e.level === filter.level);
    }

    if (filter.since) {
      entries = entries.filter(e => new Date(e.timestamp) >= filter.since!);
    }

    if (filter.until) {
      entries = entries.filter(e => new Date(e.timestamp) <= filter.until!);
    }

    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      entries = entries.filter(e => 
        e.message.toLowerCase().includes(searchLower) ||
        e.module.toLowerCase().includes(searchLower)
      );
    }

    return entries;
  }

  private parseLine(line: string): LogEntry {
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

    return {
      timestamp: '',
      level: 'INFO',
      module: '',
      message: line,
      raw: line
    };
  }

  tail(service: ServiceName | 'launcher', lines: number = 20): LogEntry[] {
    return this.readLogs({ service, lines });
  }

  follow(service: ServiceName | 'launcher', callback: (entry: LogEntry) => void): () => void {
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
          const entry = this.parseLine(line);
          callback(entry);
        }

        lastPosition = stats.size;
        lastSize = stats.size;
      }
    }, 500);

    return () => clearInterval(interval);
  }

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

  formatEntries(entries: LogEntry[], format: 'text' | 'json' = 'text'): string {
    if (format === 'json') {
      return JSON.stringify(entries, null, 2);
    }

    return entries.map(e => e.raw).join('\n');
  }

  printTail(service: ServiceName | 'launcher', lines: number = 20): void {
    const entries = this.tail(service, lines);
    
    console.log(`\n=== ${service} 日志 (最近 ${lines} 行) ===\n`);
    
    for (const entry of entries) {
      let prefix = '';
      switch (entry.level) {
        case 'ERROR': prefix = '\x1b[31m'; break;
        case 'WARN': prefix = '\x1b[33m'; break;
        case 'DEBUG': prefix = '\x1b[90m'; break;
        default: prefix = '\x1b[34m';
      }
      console.log(`${prefix}${entry.raw}\x1b[0m`);
    }
    
    console.log('');
  }
}
