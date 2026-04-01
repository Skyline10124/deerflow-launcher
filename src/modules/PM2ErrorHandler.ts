import { Logger, getLogger } from './Logger';

export const PM2ErrorCodes = {
  PM2_CONNECT_FAILED: 'PM2_CONNECT_FAILED',
  PM2_DAEMON_START_FAILED: 'PM2_DAEMON_START_FAILED',
  PM2_PROCESS_START_FAILED: 'PM2_PROCESS_START_FAILED',
  PM2_PROCESS_STOP_FAILED: 'PM2_PROCESS_STOP_FAILED',
  PM2_PROCESS_NOT_FOUND: 'PM2_PROCESS_NOT_FOUND',
  PM2_PERMISSION_DENIED: 'PM2_PERMISSION_DENIED',
  PM2_PORT_IN_USE: 'PM2_PORT_IN_USE'
} as const;

export type PM2ErrorCode = typeof PM2ErrorCodes[keyof typeof PM2ErrorCodes];

interface ErrorLike {
  code?: string;
  message: string;
}

export class PM2Error extends Error {
  constructor(
    public code: PM2ErrorCode,
    message: string,
    public suggestion?: string
  ) {
    super(message);
    this.name = 'PM2Error';
  }

  toString(): string {
    let result = `[${this.code}] ${this.message}`;
    if (this.suggestion) {
      result += `\nSuggestion: ${this.suggestion}`;
    }
    return result;
  }
}

export class PM2ErrorHandler {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('PM2ErrorHandler');
  }

  handle(error: ErrorLike): never {
    const errorCode = this.classifyError(error);
    const suggestion = this.getSuggestion(errorCode);
    
    this.logger.error(`PM2 Error [${errorCode}]: ${error.message}`);
    
    if (suggestion) {
      this.logger.info(`Suggestion: ${suggestion}`);
    }
    
    throw new PM2Error(errorCode, error.message, suggestion);
  }

  classifyError(error: ErrorLike): PM2ErrorCode {
    if (error.code === 'EACCES') {
      return PM2ErrorCodes.PM2_PERMISSION_DENIED;
    }
    if (error.code === 'EADDRINUSE') {
      return PM2ErrorCodes.PM2_PORT_IN_USE;
    }
    if (error.message?.includes('connect')) {
      return PM2ErrorCodes.PM2_CONNECT_FAILED;
    }
    if (error.message?.includes('not found') || error.message?.includes("doesn't exist")) {
      return PM2ErrorCodes.PM2_PROCESS_NOT_FOUND;
    }
    return PM2ErrorCodes.PM2_PROCESS_START_FAILED;
  }

  getSuggestion(errorCode: PM2ErrorCode): string {
    const suggestions: Record<PM2ErrorCode, string> = {
      [PM2ErrorCodes.PM2_PERMISSION_DENIED]: 
        'Try running with elevated privileges or check file permissions',
      [PM2ErrorCodes.PM2_PORT_IN_USE]: 
        'Another process is using the port. Use "deerflow stop" to stop existing services',
      [PM2ErrorCodes.PM2_CONNECT_FAILED]: 
        'PM2 daemon may be corrupted. Try "deerflow clean" to reset',
      [PM2ErrorCodes.PM2_DAEMON_START_FAILED]:
        'Check if PM2 is installed correctly and try again',
      [PM2ErrorCodes.PM2_PROCESS_START_FAILED]:
        'Check the service logs for more details',
      [PM2ErrorCodes.PM2_PROCESS_STOP_FAILED]:
        'The process may have already stopped. Try "deerflow status" to check',
      [PM2ErrorCodes.PM2_PROCESS_NOT_FOUND]:
        'The process is not running. Use "deerflow start" to start it'
    };
    return suggestions[errorCode] || '';
  }
}
