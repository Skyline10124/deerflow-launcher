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
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s ago`;
  if (minutes > 0) return `${minutes}m ${seconds}s ago`;
  return `${seconds}s ago`;
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
