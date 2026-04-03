export enum ServiceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  STARTING = 'starting',
  STOPPING = 'stopping',
  ERROR = 'error',
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface ServiceInfo {
  name: string
  status: ServiceStatus
  port: number
  pid?: number
  uptime?: string
  cpu?: number
  memory?: number
}

export interface LogEntry {
  timestamp: string
  service: string
  level: LogLevel
  message: string
  raw?: string
}

export interface TerminalSize {
  width: number
  height: number
}

export type ServiceName = 'langgraph' | 'gateway' | 'frontend' | 'nginx'
