import { EnvDoctor } from '../../src/modules/EnvDoctor';
import * as fs from 'fs';
import * as path from 'path';
import { test, expect, beforeEach, afterEach, describe } from 'bun:test';

describe('EnvDoctor', () => {
  const testDir = path.join(__dirname, 'test-doctor-' + Date.now());
  let doctor: EnvDoctor;

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    doctor = new EnvDoctor(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  test('should create doctor instance', () => {
    expect(doctor).toBeDefined();
  });

  test('should run diagnostics and return report', async () => {
    const report = await doctor.diagnose();
    
    expect(report).toBeDefined();
    expect(report.timestamp).toBeDefined();
    expect(report.checks).toBeInstanceOf(Array);
    expect(report.summary).toBeDefined();
    expect(report.summary.total).toBeGreaterThan(0);
  });

  test('should check runtime dependencies', async () => {
    const report = await doctor.diagnose();
    
    const runtimeChecks = report.checks.filter(c => c.category === 'runtime');
    expect(runtimeChecks.length).toBeGreaterThan(0);
    
    const nodeCheck = runtimeChecks.find(c => c.name === 'Node.js');
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck!.status).toBe('pass');
  });

  test('should check config files', async () => {
    const report = await doctor.diagnose();
    
    const configChecks = report.checks.filter(c => c.category === 'config');
    expect(configChecks.length).toBeGreaterThan(0);
    
    const failedConfigs = configChecks.filter(c => c.status === 'fail');
    expect(failedConfigs.length).toBeGreaterThan(0);
  });

  test('should check network ports', async () => {
    const report = await doctor.diagnose();
    
    const networkChecks = report.checks.filter(c => c.category === 'network');
    expect(networkChecks.length).toBeGreaterThan(0);
    
    const validStatuses = ['pass', 'warn'];
    networkChecks.forEach(c => {
      expect(validStatuses).toContain(c.status);
    });
  });

  test('should format report correctly', async () => {
    const report = await doctor.diagnose();
    const formatted = doctor.formatReport(report);
    
    expect(formatted).toContain('DeerFlow 环境诊断报告');
    expect(formatted).toContain('运行时');
    expect(formatted).toContain('网络');
    expect(formatted).toContain('配置');
    expect(formatted).toContain('摘要');
  });

  test('should export report as JSON', async () => {
    const report = await doctor.diagnose();
    const json = doctor.toJSON(report);
    
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.timestamp).toBe(report.timestamp);
  });

  test('should detect existing config files', async () => {
    fs.writeFileSync(path.join(testDir, 'config.yaml'), 'test: value');
    
    const report = await doctor.diagnose();
    
    const configCheck = report.checks.find(c => c.name === 'config.yaml');
    expect(configCheck).toBeDefined();
    expect(configCheck!.status).toBe('pass');
  });
});
