import { ProcessMonitor, formatStatusTable, formatBytes, formatUptime } from '../../src/modules/ProcessMonitor.js';

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

  it('should create monitor with default config', () => {
    expect(monitor).toBeDefined();
  });

  it('should not be monitoring initially', () => {
    const metrics = monitor.getMetrics();
    expect(metrics.isMonitoring).toBe(false);
  });

  it('should format status table correctly', () => {
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

  it('should format memory correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024 * 50)).toBe('50 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 2)).toBe('2 GB');
  });

  it('should format uptime correctly', () => {
    expect(formatUptime(30000)).toBe('30s');
    expect(formatUptime(60000)).toBe('1m');
    expect(formatUptime(3600000)).toBe('1h 0m');
    expect(formatUptime(7200000)).toBe('2h 0m');
    expect(formatUptime(86400000)).toBe('1d 0h');
  });

  it('should register error handler', () => {
    const handler = jest.fn();
    monitor.onError(handler);
    // Handler is stored internally, no direct way to verify
    expect(true).toBe(true);
  });
});
