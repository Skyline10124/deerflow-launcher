export enum ServiceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  STARTING = 'starting',
  STOPPING = 'stopping',
  ERROR = 'error',
}

export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SUCCESS = 'success',
  DEBUG = 'debug',
}

export interface Service {
  id: string;
  name: string;
  port: number;
  description: string;
  status: ServiceStatus;
  uptime?: string;
  pid?: number;
  cpu?: number;
  memory?: number;
}

export interface LogEntry {
  id: string;
  serviceId: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface Theme {
  colors: {
    online: string;
    offline: string;
    starting: string;
    stopping: string;
    error: string;
    primary: string;
    accent: string;
    info: string;
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    bgHover: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    border: string;
    borderActive: string;
  };
}

export interface NavigationState {
  mode: 'grid' | 'logs' | 'command';
  selectedServiceIndex: number;
  selectedLogTabIndex: number;
  commandHistory: string[];
  commandHistoryIndex: number;
}

export interface DashboardState {
  services: Service[];
  logs: LogEntry[];
  maxLogEntries: number;
  isLoading: boolean;
  error: string | null;
  navigation: NavigationState;
}

export interface TerminalSize {
  width: number;
  height: number;
}

export type ServiceName = 'langgraph' | 'gateway' | 'frontend' | 'nginx';

export interface LogService {
  id: string;
  name: string;
  color: string;
}
