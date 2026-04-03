import * as path from 'path';
import * as fs from 'fs';
import {
  isPkgEnvironment,
  getPkgRoot,
  getPkgAssetsPath,
  getScriptPath,
  getEntryPath,
  PM2Runtime
} from '../../src/modules/PM2Runtime.js';

interface ProcessWithPkg {
  pkg?: unknown;
}

describe('Packaging Runtime Integration', () => {
  const originalEnv = { ...process.env };
  const testInstanceId = 'test-instance-' + Date.now();

  afterEach(() => {
    process.env = { ...originalEnv };
    PM2Runtime.removeInstance(testInstanceId);
  });

  describe('isPkgEnvironment', () => {
    it('should return false in development environment', () => {
      expect(isPkgEnvironment()).toBe(false);
    });

    it('should detect pkg environment when process.pkg is set', () => {
      const proc = process as unknown as ProcessWithPkg;
      const originalPkg = proc.pkg;
      proc.pkg = { entrypoint: '/test/entry.js' };
      
      expect(isPkgEnvironment()).toBe(true);
      
      if (originalPkg === undefined) {
        delete proc.pkg;
      } else {
        proc.pkg = originalPkg;
      }
    });
  });

  describe('getPkgRoot', () => {
    it('should return project root in development mode', () => {
      const root = getPkgRoot();
      
      expect(root).toBeDefined();
      expect(fs.existsSync(root)).toBe(true);
    });

    it('should return exec path directory in pkg environment', () => {
      const proc = process as unknown as ProcessWithPkg;
      const originalPkg = proc.pkg;
      proc.pkg = { entrypoint: '/test/entry.js' };
      
      const root = getPkgRoot();
      expect(root).toBe(path.dirname(process.execPath));
      
      if (originalPkg === undefined) {
        delete proc.pkg;
      } else {
        proc.pkg = originalPkg;
      }
    });
  });

  describe('getPkgAssetsPath', () => {
    it('should return assets path under project root', () => {
      const assetsPath = getPkgAssetsPath();
      
      expect(assetsPath).toBeDefined();
      expect(assetsPath.endsWith('assets')).toBe(true);
    });
  });

  describe('getScriptPath', () => {
    it('should return script path in development mode', () => {
      const scriptPath = getScriptPath('wrapper.js');
      
      expect(scriptPath).toBeDefined();
      expect(scriptPath.endsWith('wrapper.js')).toBe(true);
    });

    it('should return assets path in pkg environment', () => {
      const proc = process as unknown as ProcessWithPkg;
      const originalPkg = proc.pkg;
      proc.pkg = { entrypoint: '/test/entry.js' };
      
      const scriptPath = getScriptPath('/some/path/wrapper.js');
      expect(scriptPath).toBe(path.join(getPkgAssetsPath(), 'wrapper.js'));
      
      if (originalPkg === undefined) {
        delete proc.pkg;
      } else {
        proc.pkg = originalPkg;
      }
    });
  });

  describe('getEntryPath', () => {
    it('should return entry path in development mode', () => {
      const entryPath = getEntryPath();
      
      expect(entryPath).toBeDefined();
      expect(typeof entryPath).toBe('string');
    });

    it('should return exec path in pkg environment', () => {
      const proc = process as unknown as ProcessWithPkg;
      const originalPkg = proc.pkg;
      proc.pkg = { entrypoint: '/test/entry.js' };
      
      const entryPath = getEntryPath();
      expect(entryPath).toBe(process.execPath);
      
      if (originalPkg === undefined) {
        delete proc.pkg;
      } else {
        proc.pkg = originalPkg;
      }
    });
  });

  describe('PM2Runtime', () => {
    it('should create instance with default options', () => {
      const runtime = new PM2Runtime();
      
      expect(runtime.getInstanceId()).toBe('default');
      expect(runtime.getPm2Home()).toBeDefined();
      expect(runtime.getPm2Home()).toContain('.deerflow');
    });

    it('should create instance with custom instance id', () => {
      const runtime = new PM2Runtime({ instanceId: testInstanceId });
      
      expect(runtime.getInstanceId()).toBe(testInstanceId);
      expect(runtime.getPm2Home()).toContain(testInstanceId);
    });

    it('should create pm2 home directory', () => {
      const runtime = new PM2Runtime({ instanceId: testInstanceId });
      const pm2Home = runtime.getPm2Home();
      
      expect(fs.existsSync(pm2Home)).toBe(true);
      expect(fs.existsSync(path.join(pm2Home, 'logs'))).toBe(true);
    });

    it('should return correct daemon config', () => {
      const runtime = new PM2Runtime({ instanceId: testInstanceId });
      const config = runtime.getDaemonConfig();
      
      expect(config.pidFile).toContain('pm2.pid');
      expect(config.logDir).toContain('logs');
      expect(config.rpcSocketFile).toContain('rpc.sock');
      expect(config.pubSocketFile).toContain('pub.sock');
    });

    it('should return environment with PM2_HOME', () => {
      const runtime = new PM2Runtime({ instanceId: testInstanceId });
      const env = runtime.getEnvironment();
      
      expect(env.PM2_HOME).toBe(runtime.getPm2Home());
    });

    it('should list instances', () => {
      new PM2Runtime({ instanceId: testInstanceId });
      
      const instances = PM2Runtime.listInstances();
      
      expect(Array.isArray(instances)).toBe(true);
      expect(instances).toContain(testInstanceId);
    });

    it('should remove instance', () => {
      new PM2Runtime({ instanceId: testInstanceId });
      
      const removed = PM2Runtime.removeInstance(testInstanceId);
      
      expect(removed).toBe(true);
      expect(PM2Runtime.listInstances()).not.toContain(testInstanceId);
    });

    it('should return false when removing non-existent instance', () => {
      const removed = PM2Runtime.removeInstance('non-existent-instance');
      expect(removed).toBe(false);
    });

    it('should not be connected initially', () => {
      const runtime = new PM2Runtime();
      
      expect(runtime.isConnected()).toBe(false);
    });
  });
});
