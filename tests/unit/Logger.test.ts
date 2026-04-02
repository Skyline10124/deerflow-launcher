import { Logger, LogLevel } from '../../src/modules/Logger';
import * as fs from 'fs';
import * as path from 'path';
import { test, expect, beforeEach, afterEach, describe } from 'bun:test';

describe('Logger', () => {
  const testLogDir = path.join(__dirname, 'test-logs-' + Date.now());

  beforeEach(() => {
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testLogDir)) {
      const files = fs.readdirSync(testLogDir);
      files.forEach((file) => {
        try {
          fs.unlinkSync(path.join(testLogDir, file));
        } catch {
          // ignore
        }
      });
      try {
        fs.rmdirSync(testLogDir, { recursive: true });
      } catch {
        // ignore
      }
    }
  });

  test('should create logger with default options', () => {
    const logger = new Logger('TestModule');
    expect(logger).toBeDefined();
    logger.close();
  });

  test('should log info messages', () => {
    const logger = new Logger('TestModule', {
      logDir: testLogDir,
      enableConsole: false,
      enableFile: true
    });

    logger.info('Test info message');
    logger.close();

    const files = fs.readdirSync(testLogDir);
    expect(files.length).toBeGreaterThan(0);
    
    const logContent = fs.readFileSync(path.join(testLogDir, files[0]), 'utf-8');
    expect(logContent).toContain('Test info message');
  });

  test('should respect log level', () => {
    const logger = new Logger('TestModule', {
      logDir: testLogDir,
      level: LogLevel.WARN,
      enableConsole: false,
      enableFile: true
    });

    logger.debug('This should not appear');
    logger.info('This should not appear');
    logger.warn('This should appear');
    logger.error('This should appear');
    logger.close();

    const files = fs.readdirSync(testLogDir);
    const logContent = fs.readFileSync(path.join(testLogDir, files[0]), 'utf-8');
    
    expect(logContent).not.toContain('This should not appear');
    expect(logContent).toContain('This should appear');
  });

  test('should format timestamp correctly', () => {
    const logger = new Logger('TestModule', {
      logDir: testLogDir,
      enableConsole: false,
      enableFile: true
    });

    logger.info('Test message');
    logger.close();

    const files = fs.readdirSync(testLogDir);
    const logContent = fs.readFileSync(path.join(testLogDir, files[0]), 'utf-8');
    
    expect(logContent).toContain('[INFO]');
    expect(logContent).toContain('[TestModule]');
    expect(logContent).toContain('Test message');
  });
});
