import {
  LauncherException,
  createError,
  ErrorMessages,
  getErrorSuggestion,
  createEnvError,
  createStartError
} from '../../src/utils/errors';
import { ErrorCodes, ServiceName } from '../../src/types';
import { test, expect, describe } from 'bun:test';

describe('Error Utils', () => {
  describe('LauncherException', () => {
    test('should create exception with all properties', () => {
      const error = createError(
        ErrorCodes.ENV_PYTHON_MISSING,
        'Python not found',
        {
          details: 'Python 3.12+ is required',
          service: ServiceName.LANGGRAPH,
          suggestion: 'Install Python from python.org'
        }
      );

      expect(error).toBeInstanceOf(LauncherException);
      expect(error.code).toBe(ErrorCodes.ENV_PYTHON_MISSING);
      expect(error.message).toBe('Python not found');
      expect(error.details).toBe('Python 3.12+ is required');
      expect(error.service).toBe(ServiceName.LANGGRAPH);
      expect(error.suggestion).toBe('Install Python from python.org');
    });

    test('should convert to LauncherError', () => {
      const error = createError(
        ErrorCodes.ENV_NODE_MISSING,
        'Node.js not found'
      );

      const launcherError = error.toLauncherError();
      expect(launcherError.code).toBe(ErrorCodes.ENV_NODE_MISSING);
      expect(launcherError.message).toBe('Node.js not found');
    });
  });

  describe('ErrorMessages', () => {
    test('should have messages for all error codes', () => {
      for (const code of Object.values(ErrorCodes)) {
        expect(ErrorMessages[code]).toBeDefined();
        expect(typeof ErrorMessages[code]).toBe('string');
      }
    });
  });

  describe('getErrorSuggestion', () => {
    test('should return suggestions for all error codes', () => {
      for (const code of Object.values(ErrorCodes)) {
        const suggestion = getErrorSuggestion(code);
        expect(suggestion).toBeDefined();
        expect(typeof suggestion).toBe('string');
      }
    });
  });

  describe('createEnvError', () => {
    test('should create error for missing Python', () => {
      const error = createEnvError(['Python']);
      expect(error.code).toBe(ErrorCodes.ENV_PYTHON_MISSING);
    });

    test('should create error for missing Node.js', () => {
      const error = createEnvError(['Node.js']);
      expect(error.code).toBe(ErrorCodes.ENV_NODE_MISSING);
    });

    test('should create error for multiple missing dependencies', () => {
      const error = createEnvError(['Python', 'Node.js']);
      expect(error.details).toContain('Python');
      expect(error.details).toContain('Node.js');
    });
  });

  describe('createStartError', () => {
    test('should create start error with default code', () => {
      const error = createStartError(
        ServiceName.GATEWAY,
        'Connection refused'
      );

      expect(error.code).toBe(ErrorCodes.START_PORT_TIMEOUT);
      expect(error.service).toBe(ServiceName.GATEWAY);
      expect(error.message).toContain('gateway');
      expect(error.message).toContain('Connection refused');
    });

    test('should create start error with custom code', () => {
      const error = createStartError(
        ServiceName.FRONTEND,
        'Process crashed',
        ErrorCodes.START_PROCESS_CRASH
      );

      expect(error.code).toBe(ErrorCodes.START_PROCESS_CRASH);
      expect(error.service).toBe(ServiceName.FRONTEND);
    });
  });
});
