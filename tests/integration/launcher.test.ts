import * as fs from 'fs';
import * as path from 'path';
import { ConfigInitializer } from '../../src/modules/ConfigInitializer';
import { EnvChecker } from '../../src/modules/EnvChecker';
import { test, expect, beforeEach, afterEach, describe } from 'bun:test';

describe('Integration Tests', () => {
  describe('EnvChecker Integration', () => {
    test('should check real environment', async () => {
      const checker = new EnvChecker();
      const result = await checker.check();

      expect(result).toBeDefined();
      expect(result.missing).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.missing)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('ConfigInitializer Integration', () => {
    const testDir = path.join(__dirname, 'test-config');
    const templateDir = path.join(testDir, 'templates');

    beforeEach(() => {
      if (!fs.existsSync(templateDir)) {
        fs.mkdirSync(templateDir, { recursive: true });
      }
      
      fs.writeFileSync(
        path.join(templateDir, 'config.example.yaml'),
        '# Test config\nversion: 1\n'
      );
      fs.writeFileSync(
        path.join(templateDir, '.env.example'),
        '# Test env\nAPI_KEY=\n'
      );
      
      const frontendDir = path.join(templateDir, 'frontend');
      if (!fs.existsSync(frontendDir)) {
        fs.mkdirSync(frontendDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(frontendDir, '.env.example'),
        '# Frontend env\nVITE_API_URL=\n'
      );
      fs.writeFileSync(
        path.join(templateDir, 'extensions_config.example.json'),
        '{}\n'
      );
      
      const nginxDir = path.join(templateDir, 'docker', 'nginx');
      if (!fs.existsSync(nginxDir)) {
        fs.mkdirSync(nginxDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(nginxDir, 'nginx.local.conf'),
        '# nginx config\n'
      );
    });

    afterEach(() => {
      const cleanupDir = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        files.forEach((file: string) => {
          const filePath = path.join(dir, file);
          if (fs.statSync(filePath).isDirectory()) {
            cleanupDir(filePath);
            fs.rmdirSync(filePath);
          } else {
            fs.unlinkSync(filePath);
          }
        });
      };
      
      cleanupDir(testDir);
      if (fs.existsSync(testDir)) {
        fs.rmdirSync(testDir);
      }
    });

    test('should initialize config files from templates', async () => {
      const initializer = new ConfigInitializer(templateDir);
      const result = await initializer.initialize();

      expect(result.success).toBe(true);
      expect(result.created).toContain('config.yaml');
      expect(result.created).toContain('.env');
      expect(result.created).toContain('frontend/.env');
      expect(result.created).toContain('extensions_config.json');
    });

    test('should skip existing config files', async () => {
      fs.writeFileSync(
        path.join(templateDir, 'config.yaml'),
        'existing config'
      );

      const initializer = new ConfigInitializer(templateDir);
      const result = await initializer.initialize();

      expect(result.skipped).toContain('config.yaml');
    });
  });
});
