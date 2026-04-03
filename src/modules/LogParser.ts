/**
 * 统一日志解析器模块
 * Unified Log Parser Module
 * 
 * 将各服务的不同格式日志解析为统一结构，供TUI显示和文件存储使用
 * Parses logs from different services into a unified structure for TUI display and file storage
 * 
 * 主要功能 / Key Features:
 * - 一服务一解析器 / One parser per service
 * - 统一输出结构 / Unified output structure
 * - 零转换直接使用 / Zero transformation for direct use
 * 
 * @module LogParser
 */

export enum UnifiedLogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
}

export type LogServiceName = 'launcher' | 'langgraph' | 'gateway' | 'frontend' | 'nginx';

export interface UnifiedLogEntry {
  id: string;
  timestamp: Date;
  level: UnifiedLogLevel;
  message: string;
  service: LogServiceName;
  displayTime: string;
  levelColor: string;
  serviceColor: string;
  source?: string;
  metadata?: Record<string, unknown>;
  raw: string;
}

export const LOG_LEVEL_COLORS: Record<UnifiedLogLevel, string> = {
  [UnifiedLogLevel.DEBUG]: '#6e7681',
  [UnifiedLogLevel.INFO]: '#56d4dd',
  [UnifiedLogLevel.WARN]: '#d29922',
  [UnifiedLogLevel.ERROR]: '#f85149',
  [UnifiedLogLevel.SUCCESS]: '#3fb950',
};

export const SERVICE_COLORS: Record<LogServiceName, string> = {
  launcher: '#a371f7',
  langgraph: '#3fb950',
  gateway: '#58a6ff',
  frontend: '#d29922',
  nginx: '#f85149',
};

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function formatDisplayTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function normalizeLevel(level: string): UnifiedLogLevel {
  const upper = level.toUpperCase();
  const levelMap: Record<string, UnifiedLogLevel> = {
    DEBUG: UnifiedLogLevel.DEBUG,
    INFO: UnifiedLogLevel.INFO,
    INFORMATION: UnifiedLogLevel.INFO,
    WARN: UnifiedLogLevel.WARN,
    WARNING: UnifiedLogLevel.WARN,
    ERROR: UnifiedLogLevel.ERROR,
    ERR: UnifiedLogLevel.ERROR,
    FATAL: UnifiedLogLevel.ERROR,
    SUCCESS: UnifiedLogLevel.SUCCESS,
    SUCC: UnifiedLogLevel.SUCCESS,
  };
  return levelMap[upper] || UnifiedLogLevel.INFO;
}

function createBaseEntry(
  service: LogServiceName,
  timestamp: Date,
  level: UnifiedLogLevel,
  message: string,
  raw: string,
  source?: string,
  metadata?: Record<string, unknown>
): UnifiedLogEntry {
  return {
    id: generateId(),
    timestamp,
    level,
    message,
    service,
    displayTime: formatDisplayTime(timestamp),
    levelColor: LOG_LEVEL_COLORS[level],
    serviceColor: SERVICE_COLORS[service],
    source,
    metadata,
    raw,
  };
}

export interface ServiceLogParser {
  readonly service: LogServiceName;
  readonly serviceColor: string;
  parse(line: string): UnifiedLogEntry;
}

export class LauncherParser implements ServiceLogParser {
  readonly service: LogServiceName = 'launcher';
  readonly serviceColor = SERVICE_COLORS.launcher;

  private lastLevel: UnifiedLogLevel = UnifiedLogLevel.INFO;
  private lastTimestamp: Date = new Date();

  private pattern = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s+\[(\w+)\]\s+\[(\w+)\]\s+(.*)$/;

  parse(line: string): UnifiedLogEntry {
    const match = line.match(this.pattern);

    if (match) {
      const [, timeStr, level, source, message] = match;
      const timestamp = this.parseTime(timeStr);
      const normalizedLevel = normalizeLevel(level);
      this.lastLevel = normalizedLevel;
      this.lastTimestamp = timestamp;
      return createBaseEntry(
        this.service,
        timestamp,
        normalizedLevel,
        message,
        line,
        source
      );
    }

    return createBaseEntry(
      this.service,
      this.lastTimestamp,
      this.lastLevel,
      line,
      line
    );
  }

  private parseTime(timeStr: string): Date {
    return new Date(timeStr.replace(' ', 'T'));
  }
}

export class LangGraphParser implements ServiceLogParser {
  readonly service: LogServiceName = 'langgraph';
  readonly serviceColor = SERVICE_COLORS.langgraph;

  private lastLevel: UnifiedLogLevel = UnifiedLogLevel.INFO;
  private lastTimestamp: Date = new Date();

  parse(line: string): UnifiedLogEntry {
    const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+/);
    const levelMatch = line.match(/\[(\w+)\s*\]/);

    if (timestampMatch && levelMatch) {
      const timeStr = timestampMatch[1];
      const level = levelMatch[1];

      const afterTimestamp = line.slice(timestampMatch[0].length);
      const afterLevel = afterTimestamp.replace(/^\s*\[\w+\s*\]\s*/, '');

      const timestamp = new Date(timeStr);
      const message = afterLevel.replace(/\s+/g, ' ').trim();
      const normalizedLevel = normalizeLevel(level);

      this.lastLevel = normalizedLevel;
      this.lastTimestamp = timestamp;

      return createBaseEntry(
        this.service,
        timestamp,
        normalizedLevel,
        message,
        line
      );
    }

    return createBaseEntry(
      this.service,
      this.lastTimestamp,
      this.lastLevel,
      line.replace(/\s+/g, ' ').trim(),
      line
    );
  }
}

export class GatewayParser implements ServiceLogParser {
  readonly service: LogServiceName = 'gateway';
  readonly serviceColor = SERVICE_COLORS.gateway;

  private lastLevel: UnifiedLogLevel = UnifiedLogLevel.INFO;
  private lastTimestamp: Date = new Date();

  parse(line: string): UnifiedLogEntry {
    if (line.startsWith('{')) {
      const entry = this.parseJson(line);
      this.lastLevel = entry.level;
      this.lastTimestamp = entry.timestamp;
      return entry;
    }
    return this.parseText(line);
  }

  private parseJson(line: string): UnifiedLogEntry {
    try {
      const data = JSON.parse(line);
      const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
      const level = normalizeLevel(data.level || 'info');
      const message = this.buildJsonMessage(data);
      const metadata = this.extractMetadata(data);

      return createBaseEntry(
        this.service,
        timestamp,
        level,
        message,
        line,
        'gateway',
        metadata
      );
    } catch {
      return createBaseEntry(
        this.service,
        new Date(),
        UnifiedLogLevel.INFO,
        line.replace(/\s+/g, ' ').trim(),
        line
      );
    }
  }

  private parseText(line: string): UnifiedLogEntry {
    const pythonPattern = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+-\s+(\S+)\s+-\s+(\w+)\s+-\s+(.*)$/;
    const match = line.match(pythonPattern);

    if (match) {
      const [, timeStr, _module, level, message] = match;
      const timestamp = new Date(timeStr.replace(' ', 'T'));
      const normalizedLevel = normalizeLevel(level);
      this.lastLevel = normalizedLevel;
      this.lastTimestamp = timestamp;
      return createBaseEntry(
        this.service,
        timestamp,
        normalizedLevel,
        message.replace(/\s+/g, ' ').trim(),
        line
      );
    }

    return createBaseEntry(
      this.service,
      this.lastTimestamp,
      this.lastLevel,
      line.replace(/\s+/g, ' ').trim(),
      line
    );
  }

  private buildJsonMessage(data: Record<string, unknown>): string {
    const msg = (data.msg || data.message || '') as string;
    
    if (data.method && data.path) {
      const status = data.status ? ` ${data.status}` : '';
      return `${data.method} ${data.path}${status} - ${msg}`;
    }
    
    return msg || JSON.stringify(data);
  }

  private extractMetadata(data: Record<string, unknown>): Record<string, unknown> {
    const { timestamp: _timestamp, level: _level, msg: _msg, message: _message, ...rest } = data;
    return rest;
  }
}

export class FrontendParser implements ServiceLogParser {
  readonly service: LogServiceName = 'frontend';
  readonly serviceColor = SERVICE_COLORS.frontend;

  private lastLevel: UnifiedLogLevel = UnifiedLogLevel.INFO;
  private lastTimestamp: Date = new Date();

  parse(line: string): UnifiedLogEntry {
    const nextLogPattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}):\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/;
    const match = line.match(nextLogPattern);

    if (match) {
      const [, timeStr, _innerTime, _service, message] = match;
      const timestamp = new Date(timeStr);
      const level = this.inferLevelFromMessage(message);
      this.lastLevel = level;
      this.lastTimestamp = timestamp;
      return createBaseEntry(
        this.service,
        timestamp,
        level,
        message.replace(/\s+/g, ' ').trim(),
        line
      );
    }

    return createBaseEntry(
      this.service,
      this.lastTimestamp,
      this.lastLevel,
      line.replace(/\s+/g, ' ').trim(),
      line
    );
  }

  private inferLevelFromMessage(message: string): UnifiedLogLevel {
    const statusMatch = message.match(/\s(\d{3})\s/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      if (status >= 500) return UnifiedLogLevel.ERROR;
      if (status >= 400) return UnifiedLogLevel.WARN;
    }

    if (message.toLowerCase().includes('error')) {
      return UnifiedLogLevel.ERROR;
    }
    if (message.toLowerCase().includes('warn')) {
      return UnifiedLogLevel.WARN;
    }

    return UnifiedLogLevel.INFO;
  }
}

export class NginxParser implements ServiceLogParser {
  readonly service: LogServiceName = 'nginx';
  readonly serviceColor = SERVICE_COLORS.nginx;

  private lastLevel: UnifiedLogLevel = UnifiedLogLevel.INFO;
  private lastTimestamp: Date = new Date();

  private pattern = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+[^"]+"\s+(\d+)\s+(\d+)/;

  parse(line: string): UnifiedLogEntry {
    const match = line.match(this.pattern);

    if (match) {
      const [, ip, timeStr, method, path, status, size] = match;
      const timestamp = this.parseNginxTime(timeStr);
      const statusCode = parseInt(status, 10);
      const level = this.inferLevel(statusCode);
      const message = `${method} ${path} ${status}`;
      const metadata = {
        ip,
        method,
        path,
        status: statusCode,
        size: parseInt(size, 10),
      };

      this.lastLevel = level;
      this.lastTimestamp = timestamp;

      return createBaseEntry(
        this.service,
        timestamp,
        level,
        message,
        line,
        'nginx',
        metadata
      );
    }

    return createBaseEntry(
      this.service,
      this.lastTimestamp,
      this.lastLevel,
      line,
      line
    );

  }

  private parseNginxTime(timeStr: string): Date {
    const months: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04',
      May: '05', Jun: '06', Jul: '07', Aug: '08',
      Sep: '09', Oct: '10', Nov: '11', Dec: '12',
    };
    
    const pattern = /(\d+)\/(\w+)\/(\d+):(\d+):(\d+):(\d+)\s+([+-]\d+)/;
    const match = timeStr.match(pattern);
    
    if (match) {
      const [, day, mon, year, hour, minute, second] = match;
      const month = months[mon] || '01';
      const isoStr = `${year}-${month}-${day.padStart(2, '0')}T${hour}:${minute}:${second}`;
      return new Date(isoStr);
    }
    
    return new Date();
  }

  private inferLevel(statusCode: number): UnifiedLogLevel {
    if (statusCode >= 500) return UnifiedLogLevel.ERROR;
    if (statusCode >= 400) return UnifiedLogLevel.WARN;
    if (statusCode >= 300) return UnifiedLogLevel.WARN;
    return UnifiedLogLevel.INFO;
  }
}

export class LogParserRegistry {
  private parsers: Map<LogServiceName, ServiceLogParser>;

  constructor() {
    this.parsers = new Map<LogServiceName, ServiceLogParser>([
      ['launcher', new LauncherParser()],
      ['langgraph', new LangGraphParser()],
      ['gateway', new GatewayParser()],
      ['frontend', new FrontendParser()],
      ['nginx', new NginxParser()],
    ]);
  }

  getParser(service: LogServiceName): ServiceLogParser {
    const parser = this.parsers.get(service);
    if (!parser) {
      throw new Error(`Unknown service: ${service}`);
    }
    return parser;
  }

  parse(line: string, service: LogServiceName): UnifiedLogEntry {
    return this.getParser(service).parse(line);
  }

  hasParser(service: string): boolean {
    return this.parsers.has(service as LogServiceName);
  }
}

export const logParserRegistry = new LogParserRegistry();
