export enum ServiceName {
  LANGGRAPH = 'langgraph',
  GATEWAY = 'gateway',
  FRONTEND = 'frontend',
  NGINX = 'nginx'
}

export enum ServiceStatus {
  PENDING = 'pending',
  STARTING = 'starting',
  HEALTHY = 'healthy',
  FAILED = 'failed',
  STOPPED = 'stopped'
}

export enum LaunchStatus {
  IDLE = 'idle',
  CHECKING_ENV = 'checking_env',
  INIT_CONFIG = 'init_config',
  STARTING_SERVICES = 'starting_services',
  READY = 'ready',
  FAILED = 'failed',
  SHUTTING_DOWN = 'shutting_down'
}

export interface ServiceDefinition {
  name: ServiceName;
  script: string;
  args?: string[];
  cwd: string;
  port: number;
  timeout: number;
  dependencies?: ServiceName[];
  env?: Record<string, string>;
}

export interface ServiceInstance {
  name: ServiceName;
  status: ServiceStatus;
  pid?: number;
  port: number;
  startTime?: Date;
  healthCheckDuration?: number;
  error?: string;
}

export interface LaunchContext {
  status: LaunchStatus;
  services: Map<ServiceName, ServiceInstance>;
  deerflowPath: string;
  logDir: string;
  startTime: Date;
}

export interface LaunchResult {
  success: boolean;
  status: LaunchStatus;
  services: ServiceInstance[];
  totalDuration: number;
  error?: string;
}

export interface DependencyInfo {
  version: string;
  path: string;
}

export interface EnvCheckResult {
  success: boolean;
  python?: DependencyInfo;
  node?: DependencyInfo;
  uv?: DependencyInfo;
  pnpm?: DependencyInfo;
  nginx?: DependencyInfo;
  missing: string[];
  errors: string[];
}

export interface ConfigInitResult {
  success: boolean;
  created: string[];
  skipped: string[];
  failed: string[];
}

export interface HealthCheckOptions {
  host: string;
  port: number;
  timeout: number;
  interval: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'timeout' | 'error';
  port: number;
  duration: number;
  error?: string;
}

export const ErrorCodes = {
  ENV_PYTHON_MISSING: 'ENV_PYTHON_MISSING',
  ENV_PYTHON_VERSION: 'ENV_PYTHON_VERSION',
  ENV_NODE_MISSING: 'ENV_NODE_MISSING',
  ENV_NODE_VERSION: 'ENV_NODE_VERSION',
  ENV_UV_MISSING: 'ENV_UV_MISSING',
  ENV_PNPM_MISSING: 'ENV_PNPM_MISSING',
  ENV_NGINX_MISSING: 'ENV_NGINX_MISSING',
  
  CFG_TEMPLATE_MISSING: 'CFG_TEMPLATE_MISSING',
  CFG_CREATE_FAILED: 'CFG_CREATE_FAILED',
  CFG_INVALID_PATH: 'CFG_INVALID_PATH',
  
  START_DEPENDENCY_FAILED: 'START_DEPENDENCY_FAILED',
  START_PORT_TIMEOUT: 'START_PORT_TIMEOUT',
  START_PM2_ERROR: 'START_PM2_ERROR',
  START_PROCESS_CRASH: 'START_PROCESS_CRASH',
  
  RUNTIME_PM2_DISCONNECT: 'RUNTIME_PM2_DISCONNECT',
  RUNTIME_UNEXPECTED_EXIT: 'RUNTIME_UNEXPECTED_EXIT'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export interface LauncherError {
  code: ErrorCode;
  message: string;
  details?: string;
  service?: ServiceName;
  suggestion?: string;
}

export interface ConfigFileMapping {
  template: string;
  target: string;
}

export const CONFIG_FILE_MAPPINGS: ConfigFileMapping[] = [
  { template: 'config.example.yaml', target: 'config.yaml' },
  { template: '.env.example', target: '.env' },
  { template: 'frontend/.env.example', target: 'frontend/.env' },
  { template: 'extensions_config.example.json', target: 'extensions_config.json' }
];
