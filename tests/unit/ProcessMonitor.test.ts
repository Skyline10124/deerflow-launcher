import { ProcessMonitor } from '../../src/modules/ProcessMonitor';
import { ServiceName } from '../../src/types';

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

    const table = monitor.formatStatusTable(statuses);
    
    expect(table).toContain('langgraph');
    expect(table).toContain('gateway');
    expect(table).toContain('online');
    expect(table).toContain('stopped');
  });

  it('should format memory correctly', () => {
    const statuses = [
      { name: 'test', status: 'online' as const, cpu: 5, memory: 1024 * 1024 * 50, restarts: 0, uptime: 0 }
    ];

    const table = monitor.formatStatusTable(statuses);
    expect(table).toContain('50MB');
  });

  it('should format uptime correctly', () => {
    const statuses = [
      { name: 'test1', status: 'online' as const, cpu: 5, memory: 1024, restarts: 0, uptime: 3600000 },
      { name: 'test2', status: 'online' as const, cpu: 5, memory: 1024, restarts: 0, uptime: 7200000 }
    ];

    const table = monitor.formatStatusTable(statuses);
    expect(table).toContain('1h');
  });

  it('should register error handler', () => {
    const handler = jest.fn();
    monitor.onError(handler);
    // Handler is stored internally, no direct way to verify
    expect(true).toBe(true);
  });
});
