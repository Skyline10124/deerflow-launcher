import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as pm2 from 'pm2';
import { Logger, getLogger } from './Logger';
import { PM2Error, PM2ErrorCodes } from './PM2ErrorHandler';

export interface PM2RuntimeOptions {
  logDir?: string;
  pidFile?: string;
  instanceId?: string;
}

export interface PM2DaemonConfig {
  pidFile: string;
  logDir: string;
  rpcSocketFile: string;
  pubSocketFile: string;
}

export function isPkgEnvironment(): boolean {
  return typeof (process as unknown as Record<string, unknown>).pkg !== 'undefined';
}

function getDevRootFromEntry(): string {
  const entryPath = require.main?.filename || process.argv[1];

  if (!entryPath) {
    return process.cwd();
  }

  const entryDir = path.dirname(entryPath);
  const parentDir = path.dirname(entryDir);

  if (path.basename(parentDir) === 'dist') {
    return path.dirname(parentDir);
  }

  if (path.basename(entryDir) === 'src') {
    return parentDir;
  }

  return process.cwd();
}

export function getPkgRoot(): string {
  if (isPkgEnvironment()) {
    return path.dirname(process.execPath);
  }
  return getDevRootFromEntry();
}

export function getPkgAssetsPath(): string {
  return path.join(getPkgRoot(), 'assets');
}

export function getScriptPath(scriptPath: string): string {
  const scriptName = path.basename(scriptPath);

  if (isPkgEnvironment()) {
    return path.join(getPkgAssetsPath(), scriptName);
  }

  return path.join(getPkgRoot(), 'scripts', scriptName);
}

export function getEntryPath(): string {
  if (isPkgEnvironment()) {
    return process.execPath;
  }
  return require.main?.filename || process.argv[1];
}

export class PM2Runtime {
  private logger: Logger;
  private connected: boolean = false;
  private logDir: string;
  private instanceId: string;
  private pm2Home: string;
  private previousPm2Home?: string;

  constructor(options: PM2RuntimeOptions = {}) {
    this.logger = getLogger('PM2Runtime');
    this.logDir = options.logDir || '';
    this.instanceId = options.instanceId || 'default';
    this.pm2Home = this.resolvePm2Home();
    this.ensurePm2Home();
  }

  private resolvePm2Home(): string {
    const baseDir = path.join(os.homedir(), '.deerflow');
    return path.join(baseDir, 'pm2-instances', this.instanceId);
  }

  private ensurePm2Home(): void {
    if (!fs.existsSync(this.pm2Home)) {
      fs.mkdirSync(this.pm2Home, { recursive: true });
    }
    const logDir = path.join(this.pm2Home, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  getDaemonConfig(): PM2DaemonConfig {
    return {
      pidFile: path.join(this.pm2Home, 'pm2.pid'),
      logDir: path.join(this.pm2Home, 'logs'),
      rpcSocketFile: path.join(this.pm2Home, 'rpc.sock'),
      pubSocketFile: path.join(this.pm2Home, 'pub.sock')
    };
  }

  getEnvironment(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PM2_HOME: this.pm2Home
    };
  }

  async initialize(): Promise<void> {
    this.logger.debug('Initializing PM2 runtime...');

    this.previousPm2Home = process.env.PM2_HOME;
    process.env.PM2_HOME = this.pm2Home;

    try {
      await this.connect();
      this.logger.debug('PM2 runtime initialized');
    } catch (error) {
      this.restoreEnvironment();
      throw error;
    }
  }

  private restoreEnvironment(): void {
    if (this.previousPm2Home === undefined) {
      delete process.env.PM2_HOME;
    } else {
      process.env.PM2_HOME = this.previousPm2Home;
    }
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.connect((err: Error | null) => {
        if (err) {
          this.logger.error(`Failed to connect to PM2: ${err.message}`);
          reject(new PM2Error(
            PM2ErrorCodes.PM2_CONNECT_FAILED,
            `Failed to connect to PM2 daemon: ${err.message}`,
            'PM2 daemon may be corrupted. Try "deerflow clean" to reset'
          ));
        } else {
          this.connected = true;
          this.logger.debug('Connected to PM2 daemon');
          resolve();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    return new Promise((resolve) => {
      try {
        pm2.disconnect();
        this.connected = false;
        this.restoreEnvironment();
        this.logger.debug('Disconnected from PM2 daemon');
      } catch (_error) {
        this.logger.warn('Error during PM2 disconnect');
      }
      resolve();
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  getPm2Home(): string {
    return this.pm2Home;
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  getPidFile(): string {
    return path.join(this.pm2Home, 'pm2.pid');
  }

  getLogDir(): string {
    return path.join(this.pm2Home, 'logs');
  }

  getRpcSocketFile(): string {
    return path.join(this.pm2Home, 'rpc.sock');
  }

  getPubSocketFile(): string {
    return path.join(this.pm2Home, 'pub.sock');
  }

  async killDaemon(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
    
    return new Promise((resolve) => {
      pm2.killDaemon((err: Error | null) => {
        if (err) {
          this.logger.warn(`Error killing PM2 daemon: ${err.message}`);
        } else {
          this.logger.debug('PM2 daemon killed');
        }
        this.connected = false;
        this.restoreEnvironment();
        resolve();
      });
    });
  }

  static listInstances(): string[] {
    const baseDir = path.join(os.homedir(), '.deerflow', 'pm2-instances');
    if (!fs.existsSync(baseDir)) {
      return [];
    }
    return fs.readdirSync(baseDir).filter(name => {
      const instanceDir = path.join(baseDir, name);
      return fs.statSync(instanceDir).isDirectory();
    });
  }

  static removeInstance(instanceId: string): boolean {
    const baseDir = path.join(os.homedir(), '.deerflow', 'pm2-instances', instanceId);
    if (fs.existsSync(baseDir)) {
      fs.rmSync(baseDir, { recursive: true, force: true });
      return true;
    }
    return false;
  }
}
