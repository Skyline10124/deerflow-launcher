/**
 * 日志写入器模块
 * Log Writer Module
 * 
 * 捕获 PM2 管理的服务日志，解析后以统一格式写入文件
 * Captures logs from PM2-managed services, parses them, and writes in unified format
 * 
 * 主要功能 / Key Features:
 * - 实时捕获服务日志 / Real-time log capture
 * - 统一格式写入 / Unified format writing
 * - 日志轮转支持 / Log rotation support
 * 
 * @module LogWriter
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger, getLogger } from './Logger.js';
import {
  UnifiedLogEntry,
  LogServiceName,
  logParserRegistry,
  formatTimestamp,
} from './LogParser.js';

interface PM2LogEvent {
  process: {
    name: string;
    pm_id: number;
  };
  data: string;
  at: Date;
}

interface LogWriterOptions {
  logDir: string;
  maxSize?: number;
  maxFiles?: number;
}

interface LogFileStream {
  stream: fs.WriteStream;
  currentSize: number;
  path: string;
}

export class LogWriter {
  private logger: Logger;
  private logDir: string;
  private maxSize: number;
  private maxFiles: number;
  private streams: Map<string, LogFileStream> = new Map();
  private bus: ReturnType<typeof import('pm2').launchBus> | null = null;
  private isRunning = false;

  constructor(options: LogWriterOptions) {
    this.logger = getLogger('LogWriter');
    this.logDir = options.logDir;
    this.maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB default
    this.maxFiles = options.maxFiles || 5;

    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('LogWriter is already running');
      return;
    }

    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const pm2 = require('pm2');

    return new Promise((resolve, reject) => {
      pm2.launchBus((err: Error | null, bus: ReturnType<typeof pm2.launchBus>) => {
        if (err) {
          this.logger.error('Failed to launch PM2 bus', err);
          reject(err);
          return;
        }

        this.bus = bus;
        this.isRunning = true;

        bus.on('log:out', (data: PM2LogEvent) => {
          this.handleLog(data, 'out');
        });

        bus.on('log:err', (data: PM2LogEvent) => {
          this.handleLog(data, 'err');
        });

        this.logger.info('LogWriter started, capturing PM2 logs');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    for (const [serviceName, fileStream] of this.streams) {
      await new Promise<void>(resolve => {
        fileStream.stream.end(() => {
          this.logger.debug(`Closed log stream for ${serviceName}`);
          resolve();
        });
      });
    }
    this.streams.clear();

    this.logger.info('LogWriter stopped');
  }

  private handleLog(event: PM2LogEvent, _type: 'out' | 'err'): void {
    const serviceName = event.process.name as LogServiceName;

    if (!this.isValidServiceName(serviceName)) {
      return;
    }

    const lines = event.data.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const entry = logParserRegistry.parse(line, serviceName);
      this.writeEntry(serviceName, entry);
    }
  }

  private isValidServiceName(name: string): name is LogServiceName {
    const validNames: LogServiceName[] = ['launcher', 'langgraph', 'gateway', 'frontend', 'nginx'];
    return validNames.includes(name as LogServiceName);
  }

  private writeEntry(serviceName: LogServiceName, entry: UnifiedLogEntry): void {
    let fileStream = this.streams.get(serviceName);

    if (!fileStream) {
      fileStream = this.createFileStream(serviceName);
      this.streams.set(serviceName, fileStream);
    }

    const formattedLine = this.formatEntry(entry);
    const lineWithNewline = formattedLine + '\n';

    this.checkRotation(serviceName, fileStream, lineWithNewline.length);

    fileStream.stream.write(lineWithNewline);
    fileStream.currentSize += lineWithNewline.length;
  }

  private createFileStream(serviceName: string): LogFileStream {
    const logPath = path.join(this.logDir, `${serviceName}.log`);

    const stream = fs.createWriteStream(logPath, {
      flags: 'a',
      encoding: 'utf-8',
    });

    let currentSize = 0;
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      currentSize = stats.size;
    }

    return {
      stream,
      currentSize,
      path: logPath,
    };
  }

  private formatEntry(entry: UnifiedLogEntry): string {
    return `[${formatTimestamp(entry.timestamp)}] [${entry.level}] [${entry.service}] ${entry.message}`;
  }

  private checkRotation(serviceName: string, fileStream: LogFileStream, additionalSize: number): void {
    if (fileStream.currentSize + additionalSize > this.maxSize) {
      fileStream.stream.end();
      this.rotateLog(fileStream.path);

      const newStream = this.createFileStream(serviceName);
      this.streams.set(serviceName, newStream);
    }
  }

  private rotateLog(logPath: string): void {
    const dir = path.dirname(logPath);
    const ext = path.extname(logPath);
    const base = path.basename(logPath, ext);

    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const oldFile = path.join(dir, `${base}.${i}${ext}`);
      const newFile = path.join(dir, `${base}.${i + 1}${ext}`);

      if (fs.existsSync(oldFile)) {
        if (i === this.maxFiles - 1) {
          fs.unlinkSync(oldFile);
        } else {
          fs.renameSync(oldFile, newFile);
        }
      }
    }

    if (fs.existsSync(logPath)) {
      const firstBackup = path.join(dir, `${base}.1${ext}`);
      fs.renameSync(logPath, firstBackup);
    }
  }
}
