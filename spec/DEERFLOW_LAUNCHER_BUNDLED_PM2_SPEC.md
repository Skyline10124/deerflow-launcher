# DeerFlow Launcher 内置 PM2 规范

## 版本信息
- **Version**: v0.4.0-bundled-pm2
- **创建日期**: 2026-04-01
- **适用范围**: `launcher/` 目录下所有打包相关代码

---

## 1. 概述

### 1.1 目标

将 PM2 进程管理器内置到 Launcher 打包中，实现真正的"开箱即用"体验：
- 用户无需单独安装 PM2
- 打包后的可执行文件可直接运行
- PM2 守护进程由 Launcher 自动管理

### 1.2 背景

当前 Launcher 依赖系统全局安装的 PM2，存在以下问题：
1. 用户需要额外执行 `npm install -g pm2`
2. PM2 版本可能与 Launcher 不兼容
3. 多个 Launcher 实例可能冲突

### 1.3 解决方案

采用 **Bundled Dependency** 方案：
- 将 PM2 作为生产依赖打包进 Launcher
- 使用 PM2 的 Programmatic API 管理进程
- Launcher 启动时自动初始化 PM2 守护进程

---

## 2. 技术方案

### 2.1 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    deerflow-launcher                     │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                    CLI Layer                        │ │
│  │   deerflow start | stop | status | logs | doctor   │ │
│  └─────────────────────────────────────────────────────┘ │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                 Service Manager                     │ │
│  │   ProcessManager | HealthChecker | LogManager       │ │
│  └─────────────────────────────────────────────────────┘ │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Bundled PM2 Runtime                    │ │
│  │   pm2 (v6.0.x) | @pm2/io | pm2-axon                │ │
│  └─────────────────────────────────────────────────────┘ │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              PM2 Daemon Process                     │ │
│  │   ~/.pm2/pm2.pid | ~/.pm2/logs/                     │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 2.2 PM2 版本选择

| 版本 | Node.js 兼容 | 选择理由 |
|------|-------------|---------|
| pm2@5.x | >= 12 | 稳定版，广泛使用 |
| pm2@6.x | >= 16 | 最新稳定版，推荐 |

**推荐**: `pm2@6.0.14` (当前项目已使用)

### 2.3 打包工具选择

| 工具 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| pkg | 单文件输出，无需 Node.js | 原生模块处理复杂 | ★★★★★ |
| nexe | 单文件输出 | 维护不活跃 | ★★☆☆☆ |
| electron-builder | GUI 支持 | 体积大 | ★★★☆☆ |

**推荐**: 使用 `pkg` 进行打包

---

## 3. 实现规范

### 3.1 依赖配置

```json
// package.json
{
  "dependencies": {
    "pm2": "^6.0.14",
    "@pm2/io": "^5.0.2"
  },
  "pkg": {
    "targets": ["node18-win-x64", "node18-linux-x64", "node18-macos-x64"],
    "outputPath": "dist/bin",
    "assets": [
      "node_modules/pm2/**/*",
      "node_modules/@pm2/**/*",
      "node_modules/pm2-axon/**/*",
      "node_modules/pm2-deploy/**/*",
      "node_modules/pm2-multimeter/**/*",
      "scripts/wrapper.js"
    ]
  }
}
```

### 3.2 PM2 初始化流程

```typescript
// src/modules/PM2Runtime.ts

import * as path from 'path';
import * as pm2 from 'pm2';
import { Logger, getLogger } from './Logger';

export interface PM2RuntimeOptions {
  logDir: string;
  pidFile?: string;
}

export class PM2Runtime {
  private logger: Logger;
  private connected: boolean = false;
  private logDir: string;

  constructor(options: PM2RuntimeOptions) {
    this.logger = getLogger('PM2Runtime');
    this.logDir = options.logDir;
  }

  async initialize(): Promise<void> {
    this.logger.debug('Initializing PM2 runtime...');
    
    await this.connect();
    await this.configureDaemon();
    
    this.logger.debug('PM2 runtime initialized');
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.connect((err) => {
        if (err) {
          this.logger.error(`Failed to connect to PM2: ${err.message}`);
          reject(err);
        } else {
          this.connected = true;
          this.logger.debug('Connected to PM2 daemon');
          resolve();
        }
      });
    });
  }

  private async configureDaemon(): Promise<void> {
    // 配置 PM2 守护进程
    // 设置日志路径、PID 文件位置等
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    return new Promise((resolve) => {
      try {
        pm2.disconnect();
        this.connected = false;
        this.logger.debug('Disconnected from PM2 daemon');
      } catch (error) {
        this.logger.warn('Error during PM2 disconnect');
      }
      resolve();
    });
  }

  isConnected(): boolean {
    return this.connected;
  }
}
```

### 3.3 进程管理器改造

```typescript
// src/modules/ProcessManager.ts 改造

import * as pm2 from 'pm2';
import { PM2Runtime } from './PM2Runtime';

export class ProcessManager {
  private pm2Runtime: PM2Runtime;
  private connected: boolean = false;

  constructor(logDir: string) {
    this.pm2Runtime = new PM2Runtime({ logDir });
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    // 使用内置 PM2 Runtime
    await this.pm2Runtime.initialize();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    await this.pm2Runtime.disconnect();
    this.connected = false;
  }

  // ... 其他方法保持不变
}
```

### 3.4 pkg 环境适配

```typescript
// src/utils/pkg.ts

import * as path from 'path';

declare const __non_webpack_require__: typeof require;

export function isPkgEnvironment(): boolean {
  return typeof process.pkg !== 'undefined';
}

export function getPkgRoot(): string {
  if (isPkgEnvironment()) {
    return path.dirname(process.execPath);
  }
  return process.cwd();
}

export function getPkgAssetsPath(): string {
  if (isPkgEnvironment()) {
    return path.join(path.dirname(process.execPath), 'assets');
  }
  return path.join(process.cwd(), 'assets');
}

export function requireInPkg(modulePath: string): any {
  if (isPkgEnvironment()) {
    return __non_webpack_require__(modulePath);
  }
  return require(modulePath);
}
```

### 3.5 Windows 包装器脚本

```javascript
// scripts/wrapper.js
// 用于在 Windows 上包装非 Node.js 脚本

const { spawn } = require('child_process');
const path = require('path');

const serviceName = process.argv[2];
const script = process.argv[3];
const args = process.argv.slice(4);

console.log(`[${serviceName}] Starting ${script} ${args.join(' ')}`);

const child = spawn(script, args, {
  stdio: 'inherit',
  shell: true,
  windowsHide: true
});

child.on('error', (err) => {
  console.error(`[${serviceName}] Error: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
```

---

## 4. 打包配置

### 4.1 构建脚本

```javascript
// scripts/build-release.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PLATFORMS = [
  { target: 'node18-win-x64', ext: '.exe', os: 'win' },
  { target: 'node18-linux-x64', ext: '', os: 'linux' },
  { target: 'node18-macos-x64', ext: '', os: 'macos' }
];

const VERSION = require('../package.json').version;

function build() {
  console.log('Building TypeScript...');
  execSync('npm run build', { stdio: 'inherit' });

  for (const platform of PLATFORMS) {
    console.log(`\nBuilding for ${platform.target}...`);
    
    const outputName = `deerflow-launcher${platform.ext}`;
    const outputDir = path.join('dist', 'release', `${platform.os}-x64`);
    const outputPath = path.join(outputDir, outputName);
    
    execSync(`npx pkg . --targets ${platform.target} --output ${outputPath}`, {
      stdio: 'inherit'
    });
    
    // 复制必要资源
    copyAssets(outputDir);
    
    console.log(`✓ Built ${outputPath}`);
  }
}

function copyAssets(outputDir) {
  const assetsDir = path.join(outputDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  
  // 复制 wrapper.js
  fs.copyFileSync(
    path.join('scripts', 'wrapper.js'),
    path.join(assetsDir, 'wrapper.js')
  );
}

build();
```

### 4.2 package.json scripts

```json
{
  "scripts": {
    "build": "tsc",
    "build:release": "node scripts/build-release.js",
    "build:win": "npx pkg . --targets node18-win-x64 --output dist/bin/deerflow-launcher.exe",
    "build:linux": "npx pkg . --targets node18-linux-x64 --output dist/bin/deerflow-launcher",
    "build:mac": "npx pkg . --targets node18-macos-x64 --output dist/bin/deerflow-launcher"
  }
}
```

---

## 5. PM2 守护进程管理

### 5.1 守护进程生命周期

```
┌─────────────────────────────────────────────────────────┐
│                  Launcher 启动流程                       │
├─────────────────────────────────────────────────────────┤
│  1. 检查 PM2 守护进程是否运行                            │
│     ├─ 是 → 连接到现有守护进程                           │
│     └─ 否 → 启动新的守护进程                             │
│                                                         │
│  2. 配置守护进程                                         │
│     ├─ 设置日志路径                                      │
│     ├─ 设置 PID 文件位置                                 │
│     └─ 配置资源限制                                      │
│                                                         │
│  3. 启动 DeerFlow 服务                                   │
│     ├─ langgraph                                         │
│     ├─ gateway                                           │
│     ├─ frontend                                          │
│     └─ nginx                                             │
│                                                         │
│  4. 监控服务状态                                         │
│     ├─ 健康检查                                          │
│     └─ 自动重启 (可选)                                   │
│                                                         │
│  5. 退出时清理                                           │
│     ├─ 停止所有服务                                      │
│     ├─ 断开 PM2 连接                                     │
│     └─ 可选：关闭守护进程                                │
└─────────────────────────────────────────────────────────┘
```

### 5.2 守护进程配置

```typescript
// src/modules/PM2DaemonConfig.ts

import * as path from 'path';
import * as os from 'os';

export interface PM2DaemonConfig {
  pidFile: string;
  logDir: string;
  rpcSocketFile: string;
  pubSocketFile: string;
}

export function getPM2DaemonConfig(): PM2DaemonConfig {
  const homeDir = os.homedir();
  const pm2Dir = path.join(homeDir, '.pm2');
  
  return {
    pidFile: path.join(pm2Dir, 'pm2.pid'),
    logDir: path.join(pm2Dir, 'logs'),
    rpcSocketFile: path.join(pm2Dir, 'rpc.sock'),
    pubSocketFile: path.join(pm2Dir, 'pub.sock')
  };
}
```

### 5.3 多实例隔离

```typescript
// src/modules/PM2Instance.ts

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export class PM2Instance {
  private instanceId: string;
  private pm2Home: string;

  constructor(instanceId: string = 'default') {
    this.instanceId = instanceId;
    this.pm2Home = this.getPm2Home();
    this.ensurePm2Home();
  }

  private getPm2Home(): string {
    const baseDir = path.join(os.homedir(), '.deerflow');
    return path.join(baseDir, 'pm2-instances', this.instanceId);
  }

  private ensurePm2Home(): void {
    if (!fs.existsSync(this.pm2Home)) {
      fs.mkdirSync(this.pm2Home, { recursive: true });
    }
  }

  getEnvironment(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PM2_HOME: this.pm2Home
    };
  }
}
```

---

## 6. 错误处理

### 6.1 错误码定义

```typescript
// src/types/index.ts 新增

export const PM2ErrorCodes = {
  PM2_CONNECT_FAILED: 'PM2_CONNECT_FAILED',
  PM2_DAEMON_START_FAILED: 'PM2_DAEMON_START_FAILED',
  PM2_PROCESS_START_FAILED: 'PM2_PROCESS_START_FAILED',
  PM2_PROCESS_STOP_FAILED: 'PM2_PROCESS_STOP_FAILED',
  PM2_PROCESS_NOT_FOUND: 'PM2_PROCESS_NOT_FOUND',
  PM2_PERMISSION_DENIED: 'PM2_PERMISSION_DENIED',
  PM2_PORT_IN_USE: 'PM2_PORT_IN_USE'
} as const;
```

### 6.2 错误处理策略

```typescript
// src/modules/PM2ErrorHandler.ts

import { Logger, getLogger } from './Logger';
import { PM2ErrorCodes } from '../types';

export class PM2ErrorHandler {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('PM2ErrorHandler');
  }

  handle(error: any): never {
    const errorCode = this.classifyError(error);
    const suggestion = this.getSuggestion(errorCode);
    
    this.logger.error(`PM2 Error [${errorCode}]: ${error.message}`);
    
    if (suggestion) {
      this.logger.info(`Suggestion: ${suggestion}`);
    }
    
    throw new PM2Error(errorCode, error.message, suggestion);
  }

  private classifyError(error: any): string {
    if (error.code === 'EACCES') {
      return PM2ErrorCodes.PM2_PERMISSION_DENIED;
    }
    if (error.code === 'EADDRINUSE') {
      return PM2ErrorCodes.PM2_PORT_IN_USE;
    }
    if (error.message?.includes('connect')) {
      return PM2ErrorCodes.PM2_CONNECT_FAILED;
    }
    return PM2ErrorCodes.PM2_PROCESS_START_FAILED;
  }

  private getSuggestion(errorCode: string): string {
    const suggestions: Record<string, string> = {
      [PM2ErrorCodes.PM2_PERMISSION_DENIED]: 
        'Try running with elevated privileges or check file permissions',
      [PM2ErrorCodes.PM2_PORT_IN_USE]: 
        'Another process is using the port. Use "deerflow stop" to stop existing services',
      [PM2ErrorCodes.PM2_CONNECT_FAILED]: 
        'PM2 daemon may be corrupted. Try "deerflow clean" to reset'
    };
    return suggestions[errorCode] || '';
  }
}

export class PM2Error extends Error {
  constructor(
    public code: string,
    message: string,
    public suggestion?: string
  ) {
    super(message);
    this.name = 'PM2Error';
  }
}
```

---

## 7. 测试规范

### 7.1 单元测试

```typescript
// tests/unit/PM2Runtime.test.ts

import { PM2Runtime } from '../../src/modules/PM2Runtime';
import * as pm2 from 'pm2';

jest.mock('pm2');

describe('PM2Runtime', () => {
  let runtime: PM2Runtime;

  beforeEach(() => {
    runtime = new PM2Runtime({ logDir: '/tmp/logs' });
  });

  afterEach(async () => {
    await runtime.disconnect();
  });

  describe('initialize', () => {
    it('should connect to PM2 daemon', async () => {
      (pm2.connect as jest.Mock).mockImplementation((cb) => cb(null));
      
      await runtime.initialize();
      
      expect(pm2.connect).toHaveBeenCalled();
      expect(runtime.isConnected()).toBe(true);
    });

    it('should throw on connection failure', async () => {
      (pm2.connect as jest.Mock).mockImplementation((cb) => 
        cb(new Error('Connection failed'))
      );
      
      await expect(runtime.initialize()).rejects.toThrow('Connection failed');
    });
  });
});
```

### 7.2 集成测试

```typescript
// tests/integration/pm2-bundled.test.ts

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

describe('PM2 Bundled Integration', () => {
  const launcherPath = path.join(__dirname, '../../dist/bin/deerflow-launcher');

  beforeAll(() => {
    // 确保已构建
    if (!fs.existsSync(launcherPath)) {
      execSync('npm run build:release', { stdio: 'inherit' });
    }
  });

  it('should start without global PM2', () => {
    // 移除全局 PM2
    try {
      execSync('npm uninstall -g pm2', { stdio: 'inherit' });
    } catch {}

    // 运行 launcher
    const result = execSync(`${launcherPath} --version`, { encoding: 'utf-8' });
    
    expect(result).toContain('0.4.0');
  });

  it('should start services with bundled PM2', () => {
    const result = execSync(`${launcherPath} start -d`, { encoding: 'utf-8' });
    
    expect(result).toContain('Services started');
  });
});
```

---

## 8. 发布规范

### 8.1 发布包结构

```
deerflow-launcher-v0.4.0-win-x64.zip
├── deerflow-launcher.exe    # 主程序 (包含内置 PM2)
├── assets/                   # 资源文件
│   └── wrapper.js           # Windows 包装器
├── README.txt               # 使用说明
└── LICENSE                  # 许可证

deerflow-launcher-v0.4.0-linux-x64.tar.gz
├── deerflow-launcher        # 主程序
├── assets/
├── README.txt
└── LICENSE
```

### 8.2 版本兼容性

| Launcher 版本 | 内置 PM2 版本 | Node.js 目标 |
|--------------|--------------|-------------|
| v0.4.0 | pm2@6.0.14 | node18 |
| v0.5.0+ | pm2@latest | node20 |

---

## 9. 迁移指南

### 9.1 从全局 PM2 迁移

```bash
# 1. 停止现有服务
deerflow stop -f

# 2. 清理全局 PM2 进程
pm2 kill
pm2 delete all

# 3. 使用新版 Launcher
./deerflow-launcher start -d
```

### 9.2 配置迁移

内置 PM2 使用独立的配置目录：
- 旧路径: `~/.pm2/`
- 新路径: `~/.deerflow/pm2-instances/default/`

---

## 10. 附录

### 10.1 PM2 API 参考

```typescript
// 常用 PM2 Programmatic API

// 连接
pm2.connect(callback)

// 启动进程
pm2.start(options, callback)

// 停止进程
pm2.stop(name, callback)

// 重启进程
pm2.restart(name, callback)

// 删除进程
pm2.delete(name, callback)

// 列出进程
pm2.list(callback)

// 获取进程详情
pm2.describe(name, callback)

// 断开连接
pm2.disconnect()
```

### 10.2 相关文档

- [PM2 官方文档](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [PM2 Programmatic API](https://pm2.keymetrics.io/docs/usage/pm2-api/)
- [pkg 打包工具](https://github.com/vercel/pkg)

---

**文档结束**
