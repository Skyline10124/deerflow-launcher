import { LogManager } from '../../src/modules/LogManager.js';
import { ServiceName } from '../../src/types/index.js';
import * as fs from 'fs';
import * as path from 'path';

describe('LogManager', () => {
  const testLogDir = path.join(__dirname, 'test-logs-' + Date.now());
  let logManager: LogManager;

  beforeEach(() => {
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true });
    }
    logManager = new LogManager(testLogDir);
  });

  afterEach(() => {
    if (fs.existsSync(testLogDir)) {
      try {
        fs.rmSync(testLogDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('should create log manager instance', () => {
    expect(logManager).toBeDefined();
  });

  it('should return correct log file path', () => {
    const launcherPath = logManager.getLogFilePath('launcher');
    expect(launcherPath).toBe(path.join(testLogDir, 'launcher.log'));
    
    const langgraphPath = logManager.getLogFilePath(ServiceName.LANGGRAPH);
    expect(langgraphPath).toBe(path.join(testLogDir, 'langgraph.log'));
  });

  it('should list log files', () => {
    // Create some log files
    fs.writeFileSync(path.join(testLogDir, 'launcher.log'), 'test');
    fs.writeFileSync(path.join(testLogDir, 'langgraph.log'), 'test');
    
    const files = logManager.listLogFiles();
    
    expect(files.length).toBe(2);
    expect(files.map(f => f.file)).toContain('launcher.log');
    expect(files.map(f => f.file)).toContain('langgraph.log');
  });

  it('should return empty array when no log files exist', () => {
    const files = logManager.listLogFiles();
    expect(files).toEqual([]);
  });

  it('should read logs from file', () => {
    const logContent = `[2024-01-01T00:00:00.000Z] [INFO] [Test] Message 1
[2024-01-01T00:00:01.000Z] [ERROR] [Test] Message 2
[2024-01-01T00:00:02.000Z] [WARN] [Test] Message 3`;
    
    fs.writeFileSync(path.join(testLogDir, 'launcher.log'), logContent);
    
    const entries = logManager.readLogs({ service: 'launcher' });
    
    expect(entries.length).toBe(3);
    expect(entries[0].level).toBe('INFO');
    expect(entries[1].level).toBe('ERROR');
    expect(entries[2].level).toBe('WARN');
  });

  it('should filter logs by level', () => {
    const logContent = `[2024-01-01T00:00:00.000Z] [INFO] [Test] Message 1
[2024-01-01T00:00:01.000Z] [ERROR] [Test] Message 2
[2024-01-01T00:00:02.000Z] [WARN] [Test] Message 3`;
    
    fs.writeFileSync(path.join(testLogDir, 'launcher.log'), logContent);
    
    const entries = logManager.readLogs({ service: 'launcher', level: 'ERROR' });
    
    expect(entries.length).toBe(1);
    expect(entries[0].level).toBe('ERROR');
  });

  it('should filter logs by search term', () => {
    const logContent = `[2024-01-01T00:00:00.000Z] [INFO] [Test] Starting service
[2024-01-01T00:00:01.000Z] [INFO] [Test] Service ready
[2024-01-01T00:00:02.000Z] [ERROR] [Test] Connection failed`;
    
    fs.writeFileSync(path.join(testLogDir, 'launcher.log'), logContent);
    
    const entries = logManager.readLogs({ service: 'launcher', search: 'failed' });
    
    expect(entries.length).toBe(1);
    expect(entries[0].message).toContain('failed');
  });

  it('should limit lines returned', () => {
    const lines = Array(100).fill(0).map((_, i) => 
      `[2024-01-01T00:00:00.000Z] [INFO] [Test] Message ${i}`
    ).join('\n');
    
    fs.writeFileSync(path.join(testLogDir, 'launcher.log'), lines);
    
    const entries = logManager.readLogs({ service: 'launcher', lines: 10 });
    
    expect(entries.length).toBe(10);
  });

  it('should return tail logs', () => {
    const logContent = Array(50).fill(0).map((_, i) => 
      `[2024-01-01T00:00:00.000Z] [INFO] [Test] Message ${i}`
    ).join('\n');
    
    fs.writeFileSync(path.join(testLogDir, 'launcher.log'), logContent);
    
    const entries = logManager.tail('launcher' as const, 5);
    
    expect(entries.length).toBe(5);
    expect(entries[4].message).toContain('Message 49');
  });

  it('should clear logs', () => {
    fs.writeFileSync(path.join(testLogDir, 'launcher.log'), 'test content');
    
    logManager.clearLogs('launcher');
    
    const content = fs.readFileSync(path.join(testLogDir, 'launcher.log'), 'utf-8');
    expect(content).toBe('');
  });

  it('should get log size', () => {
    fs.writeFileSync(path.join(testLogDir, 'launcher.log'), 'test content');
    
    const size = logManager.getLogSize('launcher');
    
    expect(size).toBe(12); // 'test content'.length
  });

  it('should format entries as text', () => {
    const entries = [
      { timestamp: '2024-01-01T00:00:00.000Z', level: 'INFO', module: 'Test', message: 'Msg 1', raw: '[2024-01-01T00:00:00.000Z] [INFO] [Test] Msg 1' },
      { timestamp: '2024-01-01T00:00:01.000Z', level: 'ERROR', module: 'Test', message: 'Msg 2', raw: '[2024-01-01T00:00:01.000Z] [ERROR] [Test] Msg 2' }
    ];
    
    const text = logManager.formatEntries(entries, 'text');
    
    expect(text).toContain('Msg 1');
    expect(text).toContain('Msg 2');
  });

  it('should format entries as JSON', () => {
    const entries = [
      { timestamp: '2024-01-01T00:00:00.000Z', level: 'INFO', module: 'Test', message: 'Msg 1', raw: 'raw' }
    ];
    
    const json = logManager.formatEntries(entries, 'json');
    
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
