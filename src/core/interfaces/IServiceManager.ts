import { ServiceName } from '../../types/index.js';

export interface ServiceStatusInfo {
  name: ServiceName;
  status: 'online' | 'offline' | 'launching' | 'stopping' | 'errored';
  cpu?: string;
  memory?: string;
  pid?: number;
  uptime?: string;
  restartCount: number;
  port?: number;
}

export interface StartOptions {
  only?: ServiceName[];
  watch?: boolean;
  detached?: boolean;
  timeout?: number;
  langsmith?: boolean;
}

export interface StopOptions {
  only?: ServiceName[];
  force?: boolean;
  timeout?: number;
}

export interface ILogService {
  getLogs(service: ServiceName | 'launcher', options?: {
    lines?: number;
    follow?: boolean;
    level?: string;
  }): Promise<string[]>;
  
  watchLogs(service: ServiceName | 'launcher', callback: (line: string) => void): () => void;
  
  clearLogs(service: ServiceName | 'launcher'): Promise<void>;
  
  clearAllLogs(): Promise<void>;
  
  getLogFiles(): Promise<string[]>;
}

export interface IConfigService {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  validate(): Promise<{ valid: boolean; errors: string[] }>;
  init(): Promise<void>;
}

export interface IServiceManager {
  start(options?: StartOptions): Promise<void>;
  stop(options?: StopOptions): Promise<void>;
  restart(services?: ServiceName[]): Promise<void>;
  getStatus(service?: ServiceName): Promise<ServiceStatusInfo | ServiceStatusInfo[]>;
  getAllStatus(): Promise<ServiceStatusInfo[]>;
  getLogService(): ILogService;
  getConfigService(): IConfigService;
}
