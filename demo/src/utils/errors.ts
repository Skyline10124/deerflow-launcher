import { LauncherError, ErrorCode, ErrorCodes, ServiceName } from '../types';

export class LauncherException extends Error {
  public readonly code: ErrorCode;
  public readonly details?: string;
  public readonly service?: ServiceName;
  public readonly suggestion?: string;

  constructor(error: LauncherError) {
    super(error.message);
    this.name = 'LauncherException';
    this.code = error.code;
    this.details = error.details;
    this.service = error.service;
    this.suggestion = error.suggestion;
  }

  toLauncherError(): LauncherError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      service: this.service,
      suggestion: this.suggestion
    };
  }
}

export function createError(
  code: ErrorCode,
  message: string,
  options?: {
    details?: string;
    service?: ServiceName;
    suggestion?: string;
  }
): LauncherException {
  return new LauncherException({
    code,
    message,
    ...options
  });
}

export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCodes.ENV_PYTHON_MISSING]: 'Python is not installed or not in PATH',
  [ErrorCodes.ENV_PYTHON_VERSION]: 'Python version is below 3.12',
  [ErrorCodes.ENV_NODE_MISSING]: 'Node.js is not installed or not in PATH',
  [ErrorCodes.ENV_NODE_VERSION]: 'Node.js version is below 22',
  [ErrorCodes.ENV_UV_MISSING]: 'uv is not installed or not in PATH',
  [ErrorCodes.ENV_PNPM_MISSING]: 'pnpm is not installed or not in PATH',
  [ErrorCodes.ENV_NGINX_MISSING]: 'nginx is not installed or not in PATH',
  
  [ErrorCodes.CFG_TEMPLATE_MISSING]: 'Configuration template file is missing',
  [ErrorCodes.CFG_CREATE_FAILED]: 'Failed to create configuration file',
  [ErrorCodes.CFG_INVALID_PATH]: 'Invalid DeerFlow path specified',
  
  [ErrorCodes.START_DEPENDENCY_FAILED]: 'Dependency service is not ready',
  [ErrorCodes.START_PORT_TIMEOUT]: 'Service failed to start within timeout',
  [ErrorCodes.START_PM2_ERROR]: 'PM2 process management error',
  [ErrorCodes.START_PROCESS_CRASH]: 'Service process crashed',
  
  [ErrorCodes.RUNTIME_PM2_DISCONNECT]: 'PM2 connection lost',
  [ErrorCodes.RUNTIME_UNEXPECTED_EXIT]: 'Service exited unexpectedly'
};

export function getErrorSuggestion(code: ErrorCode): string {
  const suggestions: Record<ErrorCode, string> = {
    [ErrorCodes.ENV_PYTHON_MISSING]: 'Install Python 3.12+ from https://www.python.org/downloads/',
    [ErrorCodes.ENV_PYTHON_VERSION]: 'Upgrade Python to version 3.12 or higher',
    [ErrorCodes.ENV_NODE_MISSING]: 'Install Node.js 22+ from https://nodejs.org/',
    [ErrorCodes.ENV_NODE_VERSION]: 'Upgrade Node.js to version 22 or higher',
    [ErrorCodes.ENV_UV_MISSING]: 'Install uv with: pip install uv',
    [ErrorCodes.ENV_PNPM_MISSING]: 'Install pnpm with: npm install -g pnpm',
    [ErrorCodes.ENV_NGINX_MISSING]: 'Install nginx from https://nginx.org/',
    
    [ErrorCodes.CFG_TEMPLATE_MISSING]: 'Ensure DeerFlow repository is properly cloned',
    [ErrorCodes.CFG_CREATE_FAILED]: 'Check file permissions and disk space',
    [ErrorCodes.CFG_INVALID_PATH]: 'Verify DEERFLOW_PATH environment variable',
    
    [ErrorCodes.START_DEPENDENCY_FAILED]: 'Wait for dependency services to start',
    [ErrorCodes.START_PORT_TIMEOUT]: 'Check if port is already in use or increase timeout',
    [ErrorCodes.START_PM2_ERROR]: 'Check PM2 logs for details',
    [ErrorCodes.START_PROCESS_CRASH]: 'Check service logs for crash details',
    
    [ErrorCodes.RUNTIME_PM2_DISCONNECT]: 'Restart the launcher',
    [ErrorCodes.RUNTIME_UNEXPECTED_EXIT]: 'Check service logs for exit reason'
  };

  return suggestions[code] || 'No suggestion available';
}

export function createEnvError(missing: string[]): LauncherException {
  const missingMap: Record<string, ErrorCode> = {
    'Python': ErrorCodes.ENV_PYTHON_MISSING,
    'Node.js': ErrorCodes.ENV_NODE_MISSING,
    'uv': ErrorCodes.ENV_UV_MISSING,
    'pnpm': ErrorCodes.ENV_PNPM_MISSING,
    'nginx': ErrorCodes.ENV_NGINX_MISSING
  };

  const code = missingMap[missing[0]] || ErrorCodes.ENV_PYTHON_MISSING;
  return createError(code, ErrorMessages[code], {
    details: `Missing dependencies: ${missing.join(', ')}`,
    suggestion: getErrorSuggestion(code)
  });
}

export function createStartError(
  service: ServiceName,
  reason: string,
  code: ErrorCode = ErrorCodes.START_PORT_TIMEOUT
): LauncherException {
  return createError(code, `${service} failed to start: ${reason}`, {
    service,
    suggestion: getErrorSuggestion(code)
  });
}
