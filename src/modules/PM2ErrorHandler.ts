/**
 * PM2 错误处理模块
 * PM2 Error Handler Module
 * 
 * 提供 PM2 相关错误的分类、处理和建议
 * Provides PM2 error classification, handling, and suggestions
 * 
 * @module PM2ErrorHandler
 */

import { Logger, getLogger } from './Logger.js';

/**
 * PM2 错误码常量
 * PM2 Error Codes Constants
 * 
 * 定义所有可能的 PM2 错误类型
 * Defines all possible PM2 error types
 */
export const PM2ErrorCodes = {
  /** PM2 连接失败 / PM2 connection failed */
  PM2_CONNECT_FAILED: 'PM2_CONNECT_FAILED',
  /** PM2 守护进程启动失败 / PM2 daemon start failed */
  PM2_DAEMON_START_FAILED: 'PM2_DAEMON_START_FAILED',
  /** 进程启动失败 / Process start failed */
  PM2_PROCESS_START_FAILED: 'PM2_PROCESS_START_FAILED',
  /** 进程停止失败 / Process stop failed */
  PM2_PROCESS_STOP_FAILED: 'PM2_PROCESS_STOP_FAILED',
  /** 进程未找到 / Process not found */
  PM2_PROCESS_NOT_FOUND: 'PM2_PROCESS_NOT_FOUND',
  /** 权限被拒绝 / Permission denied */
  PM2_PERMISSION_DENIED: 'PM2_PERMISSION_DENIED',
  /** 端口已被占用 / Port already in use */
  PM2_PORT_IN_USE: 'PM2_PORT_IN_USE'
} as const;

/**
 * PM2 错误码类型
 * PM2 Error Code Type
 */
export type PM2ErrorCode = typeof PM2ErrorCodes[keyof typeof PM2ErrorCodes];

/**
 * 错误对象接口
 * Error-like Object Interface
 * 
 * 用于类型安全的错误处理
 * For type-safe error handling
 */
interface ErrorLike {
  /** 错误码 (如 EACCES, EADDRINUSE) / Error code */
  code?: string;
  /** 错误消息 / Error message */
  message: string;
}

/**
 * PM2 错误类
 * PM2 Error Class
 * 
 * 自定义错误类，包含错误码和解决建议
 * Custom error class with error code and suggestion
 */
export class PM2Error extends Error {
  /**
   * 创建 PM2 错误实例
   * Create PM2 error instance
   * 
   * @param code - 错误码 / Error code
   * @param message - 错误消息 / Error message
   * @param suggestion - 解决建议 / Resolution suggestion
   */
  constructor(
    public code: PM2ErrorCode,
    message: string,
    public suggestion?: string
  ) {
    super(message);
    this.name = 'PM2Error';
  }

  /**
   * 转换为字符串
   * Convert to string
   * 
   * @returns 格式化的错误字符串 / Formatted error string
   */
  toString(): string {
    let result = `[${this.code}] ${this.message}`;
    if (this.suggestion) {
      result += `\nSuggestion: ${this.suggestion}`;
    }
    return result;
  }
}

/**
 * PM2 错误处理器
 * PM2 Error Handler
 * 
 * 处理 PM2 相关错误，提供错误分类和解决建议
 * Handles PM2 errors, provides error classification and resolution suggestions
 */
export class PM2ErrorHandler {
  /** 日志记录器 / Logger instance */
  private logger: Logger;

  constructor() {
    this.logger = getLogger('PM2ErrorHandler');
  }

  /**
   * 处理错误并抛出 PM2Error
   * Handle error and throw PM2Error
   * 
   * @param error - 错误对象 / Error object
   * @throws {PM2Error} 永远抛出 PM2Error / Always throws PM2Error
   */
  handle(error: ErrorLike): never {
    const errorCode = this.classifyError(error);
    const suggestion = this.getSuggestion(errorCode);
    
    this.logger.error(`PM2 Error [${errorCode}]: ${error.message}`);
    
    if (suggestion) {
      this.logger.info(`Suggestion: ${suggestion}`);
    }
    
    throw new PM2Error(errorCode, error.message, suggestion);
  }

  /**
   * 分类错误类型
   * Classify error type
   * 
   * 根据错误码和消息判断具体的错误类型
   * Determines specific error type from error code and message
   * 
   * @param error - 错误对象 / Error object
   * @returns PM2 错误码 / PM2 error code
   */
  classifyError(error: ErrorLike): PM2ErrorCode {
    // 权限错误 / Permission error
    if (error.code === 'EACCES') {
      return PM2ErrorCodes.PM2_PERMISSION_DENIED;
    }
    // 端口占用错误 / Port in use error
    if (error.code === 'EADDRINUSE') {
      return PM2ErrorCodes.PM2_PORT_IN_USE;
    }
    // 连接错误 / Connection error
    if (error.message?.includes('connect')) {
      return PM2ErrorCodes.PM2_CONNECT_FAILED;
    }
    // 进程未找到错误 / Process not found error
    if (error.message?.includes('not found') || error.message?.includes("doesn't exist")) {
      return PM2ErrorCodes.PM2_PROCESS_NOT_FOUND;
    }
    // 默认为进程启动失败 / Default to process start failed
    return PM2ErrorCodes.PM2_PROCESS_START_FAILED;
  }

  /**
   * 获取错误解决建议
   * Get error resolution suggestion
   * 
   * @param errorCode - PM2 错误码 / PM2 error code
   * @returns 解决建议字符串 / Resolution suggestion string
   */
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
