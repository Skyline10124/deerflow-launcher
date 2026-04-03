import { PROGRESS_BAR } from './icons.js';

export function formatMemory(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function formatTimestamp(date: Date = new Date()): string {
  return date.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatLogLevel(level: string): string {
  const levelMap: Record<string, string> = {
    info: 'INFO',
    warn: 'WARN',
    error: 'ERROR',
    success: 'SUCC',
    debug: 'DEBUG',
  };
  return levelMap[level.toLowerCase()] || level.toUpperCase();
}

export function createProgressBar(percent: number, width = 20): string {
  const complete = Math.floor((percent / 100) * width);
  const incomplete = width - complete;
  return `${PROGRESS_BAR.COMPLETE.repeat(complete)}${PROGRESS_BAR.INCOMPLETE.repeat(incomplete)}`;
}

export function padString(str: string, length: number, padStart = false): string {
  if (str.length >= length) return str;
  const padding = ' '.repeat(length - str.length);
  return padStart ? padding + str : str + padding;
}
