import * as path from 'path';
import * as fs from 'fs';
import { test, expect, afterEach, describe } from 'bun:test';

describe('Bun Runtime Integration', () => {
  const originalEnv = { ...process.env };
  const testInstanceId = 'test-instance-' + Date.now();

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Bun Environment Detection', () => {
    test('should detect Bun runtime', () => {
      expect(typeof Bun).toBe('object');
      expect(Bun.version).toBeDefined();
    });

    test('should have access to Bun APIs', () => {
      expect(typeof Bun.spawn).toBe('function');
      expect(typeof Bun.file).toBe('function');
      expect(typeof Bun.write).toBe('function');
    });
  });

  describe('Process Spawning', () => {
    test('should spawn a simple process', async () => {
      const proc = Bun.spawn(['echo', 'hello'], {
        stdout: 'pipe'
      });
      
      const text = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      
      expect(exitCode).toBe(0);
      expect(text.trim()).toBe('hello');
    });

    test('should handle process with environment variables', async () => {
      const proc = Bun.spawn(['bun', '-e', 'console.log(process.env.TEST_VAR)'], {
        env: { ...process.env, TEST_VAR: 'test_value' },
        stdout: 'pipe'
      });
      
      const text = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      
      expect(exitCode).toBe(0);
      expect(text.trim()).toBe('test_value');
    });

    test('should handle process working directory', async () => {
      const tempDir = fs.mkdtempSync(path.join(__dirname, 'test-spawn-'));
      
      const proc = Bun.spawn(['bun', '-e', 'console.log(process.cwd())'], {
        cwd: tempDir,
        stdout: 'pipe'
      });
      
      const text = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      
      expect(exitCode).toBe(0);
      expect(text.trim()).toBe(tempDir);
      
      fs.rmdirSync(tempDir);
    });
  });

  describe('File Operations', () => {
    const testFile = path.join(__dirname, 'test-bun-file.txt');

    afterEach(() => {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    });

    test('should write file using Bun.write', async () => {
      await Bun.write(testFile, 'test content');
      
      expect(fs.existsSync(testFile)).toBe(true);
      expect(fs.readFileSync(testFile, 'utf-8')).toBe('test content');
    });

    test('should read file using Bun.file', async () => {
      fs.writeFileSync(testFile, 'read test');
      
      const file = Bun.file(testFile);
      const text = await file.text();
      
      expect(text).toBe('read test');
    });
  });

  describe('Build and Compile', () => {
    test('should have bun build available', () => {
      expect(typeof Bun.build).toBe('function');
    });

    test('should build a simple script', async () => {
      const result = await Bun.build({
        entrypoints: [path.join(__dirname, '../../src/cli.ts')],
        target: 'bun',
        minify: false
      });
      
      expect(result.success).toBe(true);
      expect(result.outputs.length).toBeGreaterThan(0);
    });
  });
});
