export enum ErrorCode {
  UNKNOWN_ERROR = 1,
  INVALID_ARGUMENT = 2,
  CONFIG_NOT_FOUND = 3,
  PERMISSION_DENIED = 4,
  
  SERVICE_START_FAILED = 100,
  SERVICE_STOP_FAILED = 101,
  SERVICE_NOT_FOUND = 102,
  SERVICE_ALREADY_RUNNING = 103,
  SERVICE_NOT_RUNNING = 104,
  
  CONFIG_INVALID = 200,
  CONFIG_PARSE_ERROR = 201,
  CONFIG_VALIDATION_FAILED = 202,
  CONFIG_KEY_NOT_FOUND = 203,
  
  ENV_NODE_VERSION = 300,
  ENV_PM2_NOT_FOUND = 301,
  ENV_DEERFLOW_NOT_FOUND = 302,
  ENV_PORT_CONFLICT = 303,
  ENV_PYTHON_MISSING = 304,
  ENV_UV_MISSING = 305,
  ENV_PNPM_MISSING = 306,
  ENV_NGINX_MISSING = 307
}

export class CLIError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly suggestion?: string;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: Record<string, unknown>;
      suggestion?: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'CLIError';
    this.code = code;
    this.details = options?.details;
    this.suggestion = options?.suggestion;
    
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  toString(): string {
    let result = `[${this.code}] ${this.message}`;
    if (this.suggestion) {
      result += `\n\nSuggestion: ${this.suggestion}`;
    }
    return result;
  }
}

export function isServiceError(code: ErrorCode): boolean {
  return code >= 100 && code < 200;
}

export function isConfigError(code: ErrorCode): boolean {
  return code >= 200 && code < 300;
}

export function isEnvError(code: ErrorCode): boolean {
  return code >= 300 && code < 400;
}

export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCode.UNKNOWN_ERROR]: 'An unknown error occurred',
  [ErrorCode.INVALID_ARGUMENT]: 'Invalid argument provided',
  [ErrorCode.CONFIG_NOT_FOUND]: 'Configuration file not found',
  [ErrorCode.PERMISSION_DENIED]: 'Permission denied',
  
  [ErrorCode.SERVICE_START_FAILED]: 'Failed to start service',
  [ErrorCode.SERVICE_STOP_FAILED]: 'Failed to stop service',
  [ErrorCode.SERVICE_NOT_FOUND]: 'Service not found',
  [ErrorCode.SERVICE_ALREADY_RUNNING]: 'Service is already running',
  [ErrorCode.SERVICE_NOT_RUNNING]: 'Service is not running',
  
  [ErrorCode.CONFIG_INVALID]: 'Invalid configuration',
  [ErrorCode.CONFIG_PARSE_ERROR]: 'Failed to parse configuration',
  [ErrorCode.CONFIG_VALIDATION_FAILED]: 'Configuration validation failed',
  [ErrorCode.CONFIG_KEY_NOT_FOUND]: 'Configuration key not found',
  
  [ErrorCode.ENV_NODE_VERSION]: 'Node.js version mismatch',
  [ErrorCode.ENV_PM2_NOT_FOUND]: 'PM2 not found',
  [ErrorCode.ENV_DEERFLOW_NOT_FOUND]: 'DeerFlow directory not found',
  [ErrorCode.ENV_PORT_CONFLICT]: 'Port is already in use',
  [ErrorCode.ENV_PYTHON_MISSING]: 'Python not found',
  [ErrorCode.ENV_UV_MISSING]: 'uv not found',
  [ErrorCode.ENV_PNPM_MISSING]: 'pnpm not found',
  [ErrorCode.ENV_NGINX_MISSING]: 'nginx not found'
};

export const ErrorSuggestions: Record<ErrorCode, string> = {
  [ErrorCode.UNKNOWN_ERROR]: 'Try running with --debug for more information',
  [ErrorCode.INVALID_ARGUMENT]: 'Check the command syntax with --help',
  [ErrorCode.CONFIG_NOT_FOUND]: 'Run "deerflow config init" to create configuration',
  [ErrorCode.PERMISSION_DENIED]: 'Try running with administrator privileges',
  
  [ErrorCode.SERVICE_START_FAILED]: 'Check if the service port is available',
  [ErrorCode.SERVICE_STOP_FAILED]: 'Try using --force to force stop',
  [ErrorCode.SERVICE_NOT_FOUND]: 'Use "deerflow status" to see available services',
  [ErrorCode.SERVICE_ALREADY_RUNNING]: 'Use "deerflow restart" to restart the service',
  [ErrorCode.SERVICE_NOT_RUNNING]: 'Use "deerflow start" to start the service',
  
  [ErrorCode.CONFIG_INVALID]: 'Run "deerflow config validate" to check configuration',
  [ErrorCode.CONFIG_PARSE_ERROR]: 'Check the configuration file syntax',
  [ErrorCode.CONFIG_VALIDATION_FAILED]: 'Fix the validation errors and try again',
  [ErrorCode.CONFIG_KEY_NOT_FOUND]: 'Use "deerflow config path list" to see available paths',
  
  [ErrorCode.ENV_NODE_VERSION]: 'Install Node.js 22 or higher',
  [ErrorCode.ENV_PM2_NOT_FOUND]: 'Run "npm install -g pm2"',
  [ErrorCode.ENV_DEERFLOW_NOT_FOUND]: 'Set DEERFLOW_PATH environment variable',
  [ErrorCode.ENV_PORT_CONFLICT]: 'Stop the conflicting service or change the port',
  [ErrorCode.ENV_PYTHON_MISSING]: 'Install Python 3.12 or higher',
  [ErrorCode.ENV_UV_MISSING]: 'Run "pip install uv"',
  [ErrorCode.ENV_PNPM_MISSING]: 'Run "npm install -g pnpm"',
  [ErrorCode.ENV_NGINX_MISSING]: 'Install nginx'
};
