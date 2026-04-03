import { ServiceStatus } from '../types/index.js';
import { STATUS_ICONS } from '../constants.js';

export { STATUS_ICONS };

export const ICONS = {
  ONLINE: '●',
  OFFLINE: '○',
  STARTING: '◐',
  STOPPING: '◑',
  ERROR: '✗',
  SUCCESS: '✓',
  WARNING: '⚠',
  INFO: 'ℹ',
  PROMPT: '❯',
  LOG: '📋',
  TERMINAL: '🖥️',
  PM2: '⚡',
} as const;

export function getStatusIcon(status: ServiceStatus): string {
  return STATUS_ICONS[status] || ICONS.OFFLINE;
}

export const PROGRESS_BAR = {
  COMPLETE: '█',
  INCOMPLETE: '░',
  WIDTH: 20,
} as const;
