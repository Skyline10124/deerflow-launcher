import { ServiceStatus, LogLevel, Service, LogService, Theme } from './types/index.js';
import { ServiceName } from '../types/index.js';

export const MIN_WIDTH_FOR_HORIZONTAL = 130;

export const STATUS_COLORS: Record<ServiceStatus, string> = {
  [ServiceStatus.ONLINE]: '#3fb950',
  [ServiceStatus.OFFLINE]: '#6e7681',
  [ServiceStatus.STARTING]: '#d29922',
  [ServiceStatus.STOPPING]: '#d29922',
  [ServiceStatus.ERROR]: '#f85149',
};

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.INFO]: '#56d4dd',
  [LogLevel.WARN]: '#d29922',
  [LogLevel.ERROR]: '#f85149',
  [LogLevel.SUCCESS]: '#3fb950',
  [LogLevel.DEBUG]: '#6e7681',
};

export const SERVICE_PORTS: Record<string, number> = {
  langgraph: 2024,
  gateway: 8001,
  frontend: 3000,
  nginx: 2026,
};

export const SERVICE_DESCRIPTIONS: Record<string, string> = {
  langgraph: 'AI Workflow Engine',
  gateway: 'FastAPI Proxy',
  frontend: 'React Dashboard',
  nginx: 'Reverse Proxy',
};

export const DEFAULT_SERVICES: Service[] = [
  {
    id: 'langgraph',
    name: 'LangGraph',
    port: 2024,
    description: 'AI Workflow Engine',
    status: ServiceStatus.OFFLINE,
  },
  {
    id: 'gateway',
    name: 'Gateway',
    port: 8001,
    description: 'FastAPI Proxy',
    status: ServiceStatus.OFFLINE,
  },
  {
    id: 'frontend',
    name: 'Frontend',
    port: 3000,
    description: 'React Dashboard',
    status: ServiceStatus.OFFLINE,
  },
  {
    id: 'nginx',
    name: 'Nginx',
    port: 2026,
    description: 'Reverse Proxy',
    status: ServiceStatus.OFFLINE,
  },
];

export const LOG_SERVICES: LogService[] = [
  { id: 'launcher', name: 'Launcher', color: '#a371f7' },
  { id: 'langgraph', name: 'LangGraph', color: '#3fb950' },
  { id: 'gateway', name: 'Gateway', color: '#58a6ff' },
  { id: 'frontend', name: 'Frontend', color: '#d29922' },
  { id: 'nginx', name: 'Nginx', color: '#f85149' },
];

export const THEME: Theme = {
  colors: {
    online: '#3fb950',
    offline: '#6e7681',
    starting: '#d29922',
    stopping: '#d29922',
    error: '#f85149',
    primary: '#58a6ff',
    accent: '#a371f7',
    info: '#56d4dd',
    bgPrimary: '#0d1117',
    bgSecondary: '#161b22',
    bgTertiary: '#21262d',
    bgHover: '#1c2128',
    textPrimary: '#e6edf3',
    textSecondary: '#8b949e',
    textMuted: '#6e7681',
    border: '#30363d',
    borderActive: '#58a6ff',
  },
};

export const STATUS_ICONS = {
  [ServiceStatus.ONLINE]: '●',
  [ServiceStatus.OFFLINE]: '○',
  [ServiceStatus.STARTING]: '◐',
  [ServiceStatus.STOPPING]: '◑',
  [ServiceStatus.ERROR]: '✗',
} as const;

export const MAX_LOG_ENTRIES = 100;

export const LEVEL_FILTERS: Array<LogLevel | 'all'> = ['all', LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];

export const SERVICE_NAMES: ServiceName[] = [
  ServiceName.LANGGRAPH,
  ServiceName.GATEWAY,
  ServiceName.FRONTEND,
  ServiceName.NGINX,
];
