import chalk from 'chalk';

export interface LogFormatOptions {
  showTimestamp?: boolean;
  showService?: boolean;
  showLevel?: boolean;
  timeFormat?: 'ISO' | 'time' | 'relative';
}

export function formatTimestamp(date: Date, format: string): string {
  switch (format) {
    case 'ISO':
      return date.toISOString();
    case 'relative':
      return formatRelativeTime(date);
    case 'time':
    default:
      return date.toLocaleTimeString('en-US', { hour12: false });
  }
}

export function formatLogLevel(level: string): string {
  const colors: Record<string, (s: string) => string> = {
    debug: chalk.gray,
    info: chalk.blue,
    warn: chalk.yellow,
    error: chalk.red
  };
  
  const padded = level.toUpperCase().padEnd(5);
  return (colors[level] || chalk.white)(padded);
}

export function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export const StatusColors = {
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  muted: chalk.gray,
  highlight: chalk.cyan,
  bold: chalk.bold
} as const;

export function formatStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    online: chalk.green,
    offline: chalk.gray,
    stopping: chalk.yellow,
    launching: chalk.yellow,
    errored: chalk.red
  };
  return (colors[status] || chalk.white)(status);
}

export function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    online: '🟢',
    offline: '⚪',
    launching: '🟡',
    stopping: '🟡',
    errored: '🔴'
  };
  return icons[status] || '⚪';
}
