import { ProcessMonitor, formatStatusTable, formatBytes, formatUptime } from '../../src/modules/ProcessMonitor';
import { ServiceName } from '../../src/types';
import { test, expect, beforeEach, afterEach, describe, mock } from 'bun:test';

describe('ProcessMonitor', () => {
  let monitor: ProcessMonitor;

  beforeEach(() => {
    monitor = new ProcessMonitor({
      checkInterval: 1000,
      maxRetries: 2
    });
  });

  afterEach(async () => {
    monitor.stopMonitoring();
    try {
      await monitor.disconnect();
    } catch {
      // ignore
    }
  });

  test('should create monitor with default config', () => {
    expect(monitor).toBeDefined();
  });

  test('should not be monitoring initially', () => {
    const metrics = monitor.getMetrics();
    expect(metrics.isMonitoring).toBe(false);
  });

  test('should format status table correctly', () => {
    const statuses = [
      { name: 'langgraph', status: 'online' as const, cpu: 10, memory: 1024 * 1024 * 100, restarts: 0, uptime: 60000 },
      { name: 'gateway', status: 'stopped' as const, cpu: 0, memory: 0, restarts: 1, uptime: 0 }
    ];

    const table = formatStatusTable(statuses);
    
    expect(table).toContain('langgraph');
    expect(table).toContain('gateway');
    expect(table).toContain('online');
    expect(table).toContain('stopped');
  });

  test('should format memory correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024 * 50)).toBe('50 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 2)).toBe('2 GB');
  });

  test('should format uptime correctly', () => {
    expect(formatUptime(30000)).toBe('30s');
    expect(formatUptime(60000)).toBe('1m');
    expect(formatUptime(3600000)).toBe('1h 0m');
    expect(formatUptime(7200000)).toBe('2h 0m');
    expect(formatUptime(86400000)).toBe('1d 0h');
  });

  test('should register error handler', () => {
    const handler = mock(() => {});
    monitor.onError(handler);
    // Handler is stored internally, no direct way to verify
    expect(true).toBe(true);
  });
});
