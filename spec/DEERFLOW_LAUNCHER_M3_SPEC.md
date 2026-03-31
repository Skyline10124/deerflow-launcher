# DeerFlow Launcher CLI 开发规范

## 版本信息
- **Version**: v0.3.0-cli
- **创建日期**: 2026-03-31
- **适用范围**: `src/cli/` 目录下所有代码

---

## 1. 命令设计规范

### 1.1 命令层级结构

```
deerflow [namespace] <command> [arguments] [options]
```

**命名空间划分**:

| 命名空间  | 用途     | 示例                                              |
| --------- | -------- | ------------------------------------------------- |
| (root)    | 快捷命令 | `deerflow start`, `deerflow status`               |
| `service` | 服务管理 | `deerflow service start`, `deerflow service stop` |
| `logs`    | 日志管理 | `deerflow logs`, `deerflow logs:export`           |
| `config`  | 配置管理 | `deerflow config get`, `deerflow config set`      |
| `doctor`  | 环境诊断 | `deerflow doctor`, `deerflow doctor --fix`        |

### 1.2 命令命名规则

```typescript
// ✅ 正确 - 使用动词原形，简洁明确
program.command('start [services...]')
program.command('logs [services...]')
program.command('config:get <key>')

// ❌ 错误 - 不要使用
program.command('svc-start')      // 不要用连字符分隔动词
program.command('logging')        // 不要动名词
program.command('configGet')      // 不要用驼峰
```

### 1.3 参数命名规则

```typescript
// ✅ 正确 - 使用 camelCase
.option('-w, --watch', 'Watch for changes')
.option('-f, --follow', 'Follow log output')
.option('-n, --lines <number>', 'Number of lines')

// ❌ 错误
.option('--watch-mode', '...')     // 不要用连字符
.option('-L, --Lines', '...')       // 不要大写
```

### 1.4 命令实现模板

```typescript
// src/cli/commands/<namespace>/<command>.ts

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import type { IServiceManager } from '../../../core/interfaces/IServiceManager';
import { CLIError, ErrorCode } from '../../utils/errors';
import { formatServiceTable } from '../../components/ServiceTable';

export function registerStartCommand(
  program: Command, 
  services: IServiceManager
): void {
  program
    .command('start [services...]')
    .description('Start DeerFlow services')
    .option('-w, --watch', 'Watch configuration files for changes', false)
    .option('-d, --detach', 'Run services in background', false)
    .option('-t, --timeout <seconds>', 'Startup timeout', '60')
    .action(async (serviceNames: string[], options) => {
      // 1. 参数验证
      const timeout = parseInt(options.timeout);
      if (isNaN(timeout) || timeout < 1) {
        throw new CLIError(
          ErrorCode.INVALID_ARGUMENT,
          'Timeout must be a positive number'
        );
      }

      // 2. 用户确认（破坏性操作）
      if (options.watch && serviceNames.length === 0) {
        const confirmed = await confirmAction(
          'This will start all services in watch mode. Continue?'
        );
        if (!confirmed) {
          console.log(chalk.gray('Cancelled'));
          return;
        }
      }

      // 3. 执行操作（带进度指示）
      const spinner = ora({
        text: 'Starting services...',
        spinner: 'dots'
      }).start();

      try {
        await services.start({
          only: serviceNames.length > 0 ? serviceNames : undefined,
          watch: options.watch,
          detached: options.detach
        });

        spinner.succeed(chalk.green('Services started successfully'));

        // 4. 输出结果
        const statuses = await services.getAllStatus();
        console.log('\n' + formatServiceTable(statuses));

      } catch (error) {
        spinner.fail();
        
        // 5. 错误处理
        if (error instanceof CLIError) {
          throw error; // 已格式化的错误
        }
        
        throw new CLIError(
          ErrorCode.SERVICE_START_FAILED,
          `Failed to start services: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        );
      }
    });
}
```

---

## 2. 代码组织规范

### 2.1 目录结构

```
src/cli/
├── index.ts                    # CLI入口，命令注册中心
├── commands/                   # 命令实现
│   ├── index.ts               # 命令导出
│   ├── service/               # 服务管理命令
│   │   ├── index.ts          # 注册函数导出
│   │   ├── start.ts
│   │   ├── stop.ts
│   │   ├── restart.ts
│   │   ├── status.ts
│   │   └── reload.ts
│   ├── logs/                  # 日志管理命令
│   │   ├── index.ts
│   │   ├── view.ts           # logs 主命令
│   │   ├── export.ts         # logs:export
│   │   └── clean.ts          # logs:clean
│   ├── config/                # 配置管理命令
│   │   ├── index.ts
│   │   ├── init.ts
│   │   ├── get.ts
│   │   ├── set.ts
│   │   ├── validate.ts
│   │   └── edit.ts
│   └── doctor/                # 环境诊断命令
│       ├── index.ts
│       └── check.ts
├── components/                 # 可复用CLI组件
│   ├── ServiceTable.ts        # 服务状态表格
│   ├── LogViewer.ts          # 日志查看组件
│   ├── ProgressBar.ts        # 进度条
│   ├── ConfirmPrompt.ts      # 确认提示
│   └── ErrorDisplay.ts       # 错误显示
├── utils/                      # 工具函数
│   ├── format.ts             # 格式化工具
│   ├── errors.ts             # 错误处理
│   ├── validators.ts         # 参数验证
│   └── prompts.ts            # 交互提示配置
└── interactive/               # 交互模式
    ├── index.ts              # 交互模式入口
    ├── menu.ts               # 主菜单
    └── handlers/             # 菜单处理器
        ├── startHandler.ts
        ├── statusHandler.ts
        └── logsHandler.ts
```

### 2.2 模块导出规范

```typescript
// src/cli/commands/service/index.ts

export { registerStartCommand } from './start';
export { registerStopCommand } from './stop';
export { registerStatusCommand } from './status';
export { registerRestartCommand } from './restart';
export { registerReloadCommand } from './reload';

import { Command } from 'commander';
import type { IServiceManager } from '../../../core/interfaces/IServiceManager';
import { registerStartCommand } from './start';
import { registerStopCommand } from './stop';
import { registerStatusCommand } from './status';
import { registerRestartCommand } from './restart';
import { registerReloadCommand } from './reload';

export function registerServiceCommands(
  program: Command,
  services: IServiceManager
): void {
  const serviceCmd = program
    .command('service')
    .alias('svc')
    .description('Service management commands');

  registerStartCommand(serviceCmd, services);
  registerStopCommand(serviceCmd, services);
  registerStatusCommand(serviceCmd, services);
  registerRestartCommand(serviceCmd, services);
  registerReloadCommand(serviceCmd, services);
}
```

---

## 3. 输出格式规范

### 3.1 颜色使用规范

```typescript
import chalk from 'chalk';

// ✅ 状态颜色 - 统一语义
const StatusColors = {
  success: chalk.green,      // 成功、在线、正常
  error: chalk.red,          // 错误、失败、离线
  warning: chalk.yellow,     // 警告、降级
  info: chalk.blue,          // 信息、提示
  muted: chalk.gray,         // 次要信息、时间戳
  highlight: chalk.cyan,     // 高亮、服务名
  bold: chalk.bold           // 标题、重要内容
} as const;

// 使用示例
console.log(StatusColors.success('✓ Service started'));
console.log(StatusColors.error('✗ Failed to connect'));
console.log(StatusColors.muted(new Date().toISOString()));
```

### 3.2 表格输出规范

```typescript
// src/cli/components/ServiceTable.ts

import Table from 'cli-table3';
import chalk from 'chalk';
import type { ServiceStatus } from '../../core/interfaces/IServiceManager';

export interface ServiceTableOptions {
  showPorts?: boolean;
  compact?: boolean;
}

export function formatServiceTable(
  services: ServiceStatus[],
  options: ServiceTableOptions = {}
): string {
  const { showPorts = false, compact = false } = options;

  // 表头样式
  const table = new Table({
    head: compact 
      ? ['Service', 'Status', 'Memory']
      : ['Service', 'Status', 'CPU', 'Memory', 'PID', 'Uptime', 'Restarts'],
    style: { 
      head: ['cyan', 'bold'],
      border: compact ? [] : ['gray']
    },
    colWidths: compact 
      ? [12, 10, 12]
      : [12, 10, 8, 12, 10, 12, 10],
    chars: compact ? {
      'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
      'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
      'left': '', 'left-mid': '', 'mid': ' ', 'mid-mid': '',
      'right': '', 'right-mid': '', 'middle': ' '
    } : undefined
  });

  for (const svc of services) {
    const row = compact
      ? [
          chalk.bold(svc.name),
          formatStatus(svc.status),
          svc.memory || '-'
        ]
      : [
          chalk.bold(svc.name),
          formatStatus(svc.status),
          svc.cpu || '-',
          svc.memory || '-',
          svc.pid?.toString() || '-',
          svc.uptime || '-',
          svc.restartCount.toString()
        ];
    
    table.push(row);
  }

  return table.toString();
}

function formatStatus(status: ServiceStatus['status']): string {
  const colors: Record<typeof status, (s: string) => string> = {
    online: chalk.green,
    offline: chalk.red,
    stopping: chalk.yellow,
    launching: chalk.yellow,
    errored: chalk.red
  };
  return colors[status](status);
}
```

### 3.3 日志输出规范

```typescript
// src/cli/utils/format.ts

import chalk from 'chalk';
import type { LogEntry } from '../../core/interfaces/ILogService';

export interface LogFormatOptions {
  showTimestamp?: boolean;
  showService?: boolean;
  showLevel?: boolean;
  timeFormat?: 'ISO' | 'time' | 'relative';
}

export function formatLogEntry(
  entry: LogEntry,
  options: LogFormatOptions = {}
): string {
  const {
    showTimestamp = true,
    showService = true,
    showLevel = true,
    timeFormat = 'time'
  } = options;

  const parts: string[] = [];

  // 时间戳
  if (showTimestamp) {
    parts.push(chalk.gray(formatTimestamp(entry.timestamp, timeFormat)));
  }

  // 日志级别
  if (showLevel) {
    parts.push(formatLogLevel(entry.level));
  }

  // 服务名
  if (showService) {
    parts.push(chalk.cyan(`[${entry.service}]`));
  }

  // 消息内容
  parts.push(entry.message);

  return parts.join(' ');
}

function formatTimestamp(date: Date, format: string): string {
  switch (format) {
    case 'ISO':
      return date.toISOString();
    case 'relative':
      return formatRelativeTime(date);
    case 'time':
    default:
      return date.toLocaleTimeString('en-US', { hour12: false });
  }
}

function formatLogLevel(level: LogEntry['level']): string {
  const colors: Record<typeof level, (s: string) => string> = {
    debug: chalk.gray,
    info: chalk.blue,
    warn: chalk.yellow,
    error: chalk.red
  };
  
  const padded = level.toUpperCase().padEnd(5);
  return colors[level](padded);
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
```

### 3.4 进度指示规范

```typescript
// src/cli/components/ProgressBar.ts

import ora, { Ora } from 'ora';
import chalk from 'chalk';

export interface TaskStep {
  name: string;
  action: () => Promise<void>;
  skip?: () => boolean;  // 条件跳过
}

export class MultiStepProgress {
  private steps: TaskStep[];
  private current?: Ora;
  private completed: string[] = [];
  private failed: Array<{ name: string; error: Error }> = [];

  constructor(steps: TaskStep[]) {
    this.steps = steps;
  }

  async run(): Promise<{ success: boolean; completed: string[]; failed: typeof this.failed }> {
    console.log(chalk.bold(`\nRunning ${this.steps.length} tasks...\n`));

    for (const step of this.steps) {
      // 检查跳过条件
      if (step.skip?.()) {
        console.log(chalk.gray(`⏭  ${step.name} (skipped)`));
        continue;
      }

      // 开始任务
      this.current = ora({
        text: step.name,
        spinner: 'dots',
        color: 'cyan'
      }).start();

      try {
        await step.action();
        this.current.succeed(chalk.green(step.name));
        this.completed.push(step.name);
      } catch (error) {
        this.current.fail(chalk.red(step.name));
        this.failed.push({
          name: step.name,
          error: error instanceof Error ? error : new Error(String(error))
        });
        
        // 继续执行后续任务（不中断）
      }
    }

    // 输出总结
    console.log('');
    if (this.failed.length === 0) {
      console.log(chalk.green(`✓ All ${this.completed.length} tasks completed\n`));
    } else {
      console.log(chalk.yellow(`⚠ ${this.completed.length} succeeded, ${this.failed.length} failed\n`));
      for (const fail of this.failed) {
        console.log(chalk.red(`  ✗ ${fail.name}: ${fail.error.message}`));
      }
      console.log('');
    }

    return {
      success: this.failed.length === 0,
      completed: this.completed,
      failed: this.failed
    };
  }
}

// 使用示例
const progress = new MultiStepProgress([
  { name: 'Checking environment', action: () => checkEnv() },
  { name: 'Validating configuration', action: () => validateConfig() },
  { 
    name: 'Starting Gateway', 
    action: () => startService('gateway'),
    skip: () => options.skipGateway  // 条件跳过
  },
  { name: 'Starting Core', action: () => startService('core') },
  { name: 'Starting Frontend', action: () => startService('frontend') },
  { name: 'Starting Nginx', action: () => startService('nginx') }
]);

const result = await progress.run();
if (!result.success) {
  process.exit(1);
}
```

---

## 4. 错误处理规范

### 4.1 错误类定义

```typescript
// src/cli/utils/errors.ts

export enum ErrorCode {
  // 通用错误 (1-99)
  UNKNOWN_ERROR = 1,
  INVALID_ARGUMENT = 2,
  CONFIG_NOT_FOUND = 3,
  PERMISSION_DENIED = 4,
  
  // 服务错误 (100-199)
  SERVICE_START_FAILED = 100,
  SERVICE_STOP_FAILED = 101,
  SERVICE_NOT_FOUND = 102,
  SERVICE_ALREADY_RUNNING = 103,
  SERVICE_NOT_RUNNING = 104,
  
  // 配置错误 (200-299)
  CONFIG_INVALID = 200,
  CONFIG_PARSE_ERROR = 201,
  CONFIG_VALIDATION_FAILED = 202,
  
  // 环境错误 (300-399)
  ENV_NODE_VERSION = 300,
  ENV_PM2_NOT_FOUND = 301,
  ENV_DEERFLOW_NOT_FOUND = 302,
  ENV_PORT_CONFLICT = 303
}

export class CLIError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly suggestion?: string;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: Record<string, unknown>;
      suggestion?: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'CLIError';
    this.code = code;
    this.details = options?.details;
    this.suggestion = options?.suggestion;
    
    // 保持错误链
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  toString(): string {
    let result = `[${this.code}] ${this.message}`;
    if (this.suggestion) {
      result += `\n\nSuggestion: ${this.suggestion}`;
    }
    return result;
  }
}

// 错误分类帮助函数
export function isServiceError(code: ErrorCode): boolean {
  return code >= 100 && code < 200;
}

export function isConfigError(code: ErrorCode): boolean {
  return code >= 200 && code < 300;
}

export function isEnvError(code: ErrorCode): boolean {
  return code >= 300 && code < 400;
}
```

### 4.2 全局错误处理

```typescript
// src/cli/index.ts

import { Command } from 'commander';
import chalk from 'chalk';
import { CLIError, ErrorCode } from './utils/errors';

export function setupErrorHandling(program: Command): void {
  // 捕获未处理的 Promise 错误
  process.on('unhandledRejection', (reason) => {
    console.error(chalk.red('\nUnexpected error:'), reason);
    process.exit(ErrorCode.UNKNOWN_ERROR);
  });

  // 捕获同步错误
  process.on('uncaughtException', (error) => {
    console.error(chalk.red('\nUnexpected error:'), error);
    process.exit(ErrorCode.UNKNOWN_ERROR);
  });

  // Commander 错误处理
  program.exitOverride();
  
  program.hook('postAction', (thisCommand) => {
    const exitCode = thisCommand.processedArgs?.[0];
    if (typeof exitCode === 'number') {
      process.exit(exitCode);
    }
  });
}

export function handleError(error: unknown): never {
  if (error instanceof CLIError) {
    // CLI 已知错误
    console.error(chalk.red(`\nError [${error.code}]: ${error.message}`));
    
    if (error.details) {
      console.error(chalk.gray('\nDetails:'));
      for (const [key, value] of Object.entries(error.details)) {
        console.error(chalk.gray(`  ${key}: ${value}`));
      }
    }
    
    if (error.suggestion) {
      console.error(chalk.yellow(`\n💡 ${error.suggestion}`));
    }
    
    // 调试模式显示堆栈
    if (process.env.DEBUG === 'true' && error.cause) {
      console.error(chalk.gray('\nCaused by:'));
      console.error(error.cause);
    }
    
    process.exit(error.code);
  }

  // 未知错误
  console.error(chalk.red('\nUnexpected error:'));
  console.error(error);
  
  if (process.env.DEBUG === 'true') {
    console.error(chalk.gray('\nStack trace:'));
    if (error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack));
    }
  }
  
  process.exit(ErrorCode.UNKNOWN_ERROR);
}
```

### 4.3 命令内错误处理

```typescript
// 示例：带错误处理的命令
.command('start [services...]')
.action(async (services, options) => {
  try {
    await doSomething();
  } catch (error) {
    // 转换底层错误为 CLIError
    if (error instanceof PM2ConnectError) {
      throw new CLIError(
        ErrorCode.SERVICE_START_FAILED,
        'Failed to connect to PM2 daemon',
        {
          suggestion: 'Try running: pm2 status',
          cause: error
        }
      );
    }
    
    // 重新抛出或包装
    throw error;
  }
});
```

---

## 5. 交互设计规范

### 5.1 确认提示

```typescript
// src/cli/components/ConfirmPrompt.ts

import inquirer from 'inquirer';
import chalk from 'chalk';

export interface ConfirmOptions {
  message: string;
  default?: boolean;
  destructive?: boolean;  // 破坏性操作（红色警告）
}

export async function confirm(options: ConfirmOptions): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmed',
    message: options.destructive 
      ? chalk.red(options.message)
      : options.message,
    default: options.default ?? false
  }]);
  
  return confirmed;
}

// 快速确认函数
export async function confirmDestructive(action: string): Promise<boolean> {
  return confirm({
    message: `This will ${action}. Are you sure?`,
    destructive: true
  });
}

// 使用场景
if (options.force) {
  const confirmed = await confirmDestructive(
    'STOP ALL RUNNING SERVICES'
  );
  if (!confirmed) {
    console.log(chalk.gray('Operation cancelled'));
    return;
  }
}
```

### 5.2 选择列表

```typescript
// src/cli/components/ServiceSelector.ts

import inquirer from 'inquirer';
import type { ServiceStatus } from '../../core/interfaces/IServiceManager';

export async function selectServices(
  services: ServiceStatus[],
  options: {
    message?: string;
    allowAll?: boolean;
    defaultSelected?: string[];
  } = {}
): Promise<string[]> {
  const { 
    message = 'Select services:', 
    allowAll = true,
    defaultSelected = []
  } = options;

  const choices: inquirer.CheckboxChoiceOptions[] = [];

  if (allowAll) {
    choices.push(
      { name: '✓ All services', value: 'ALL' },
      new inquirer.Separator()
    );
  }

  choices.push(...services.map(s => ({
    name: `${getStatusIcon(s.status)} ${s.name.padEnd(12)} ${s.status}`,
    value: s.name,
    checked: defaultSelected.includes(s.name) || s.status === 'offline'
  })));

  const { selected } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selected',
    message,
    choices,
    validate: (input: string[]) => {
      if (input.length === 0) {
        return 'Please select at least one service';
      }
      if (input.includes('ALL')) {
        return true;  // 'ALL' 是有效选择
      }
      return true;
    }
  }]);

  // 处理 'ALL' 选择
  if (selected.includes('ALL')) {
    return services.map(s => s.name);
  }

  return selected;
}

function getStatusIcon(status: ServiceStatus['status']): string {
  const icons: Record<typeof status, string> = {
    online: '🟢',
    offline: '⚪',
    launching: '🟡',
    stopping: '🟡',
    errored: '🔴'
  };
  return icons[status];
}
```

### 5.3 实时刷新界面

```typescript
// src/cli/components/LiveStatus.ts

import readline from 'readline';
import chalk from 'chalk';
import type { IServiceManager, ServiceStatus } from '../../core/interfaces/IServiceManager';

export class LiveStatusMonitor {
  private serviceManager: IServiceManager;
  private interval?: NodeJS.Timeout;
  private isRunning = false;

  constructor(serviceManager: IServiceManager) {
    this.serviceManager = serviceManager;
  }

  async start(options: {
    interval?: number;
    onUpdate?: (statuses: ServiceStatus[]) => void;
  } = {}): Promise<void> {
    const { interval = 2000, onUpdate } = options;
    
    this.isRunning = true;
    
    // 隐藏光标
    process.stdout.write('\x1B[?25l');
    
    // 首次渲染
    await this.render();
    onUpdate?.(await this.serviceManager.getAllStatus());

    // 设置定时刷新
    this.interval = setInterval(async () => {
      if (!this.isRunning) return;
      
      // 清屏并重新渲染
      readline.cursorTo(process.stdout, 0, 0);
      readline.clearScreenDown(process.stdout);
      
      await this.render();
      onUpdate?.(await this.serviceManager.getAllStatus());
    }, interval);

    // 监听退出
    process.on('SIGINT', () => this.stop());
  }

  stop(): void {
    this.isRunning = false;
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    
    // 恢复光标
    process.stdout.write('\x1B[?25h');
    console.log(chalk.gray('\n\nMonitoring stopped.'));
  }

  private async render(): Promise<void> {
    const statuses = await this.serviceManager.getAllStatus();
    
    console.log(chalk.bold.cyan('DeerFlow Services'));
    console.log(chalk.gray('Press Ctrl+C to exit\n'));
    
    for (const svc of statuses) {
      const statusColor = svc.status === 'online' ? chalk.green
        : svc.status === 'offline' ? chalk.gray
        : chalk.yellow;
      
      console.log(
        `${statusColor('●')} ${svc.name.padEnd(12)} ` +
        `${statusColor(svc.status.padEnd(10))} ` +
        `${chalk.gray(svc.memory || '--')} ` +
        `${chalk.gray(svc.uptime || '--')}`
      );
    }
    
    console.log(chalk.gray(`\nLast update: ${new Date().toLocaleTimeString()}`));
  }
}
```

---

## 6. 配置规范

### 6.1 CLI 配置文件

```typescript
// src/cli/config.ts

import { homedir } from 'os';
import { join } from 'path';

export interface CLIConfig {
  // 显示设置
  theme: 'default' | 'minimal' | 'verbose';
  colors: boolean;
  timestamps: boolean;
  
  // 行为设置
  confirmDestructive: boolean;
  autoStartServices: string[];
  defaultLogLines: number;
  
  // 路径设置
  deerflowPath?: string;
  logDirectory?: string;
}

export const DEFAULT_CONFIG: CLIConfig = {
  theme: 'default',
  colors: true,
  timestamps: true,
  confirmDestructive: true,
  autoStartServices: [],
  defaultLogLines: 50
};

export function getConfigPath(): string {
  return join(homedir(), '.deerflow', 'cli-config.json');
}

export async function loadConfig(): Promise<CLIConfig> {
  try {
    const fs = await import('fs/promises');
    const data = await fs.readFile(getConfigPath(), 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: Partial<CLIConfig>): Promise<void> {
  const fs = await import('fs/promises');
  const current = await loadConfig();
  const merged = { ...current, ...config };
  
  await fs.mkdir(join(homedir(), '.deerflow'), { recursive: true });
  await fs.writeFile(getConfigPath(), JSON.stringify(merged, null, 2));
}
```

### 6.2 环境变量

```typescript
// src/cli/env.ts

export interface CLIEnvironment {
  // 调试
  DEERFLOW_DEBUG?: string;
  DEERFLOW_LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
  
  // 路径
  DEERFLOW_PATH?: string;
  DEERFLOW_CONFIG?: string;
  
  // 行为
  DEERFLOW_NO_COLOR?: string;
  DEERFLOW_FORCE_TTY?: string;
  
  // 集成
  EDITOR?: string;
  SHELL?: string;
}

export function getEnv(): CLIEnvironment {
  return process.env as CLIEnvironment;
}

export function isDebug(): boolean {
  return getEnv().DEERFLOW_DEBUG === 'true' || process.env.DEBUG?.includes('deerflow');
}

export function isColorDisabled(): boolean {
  return getEnv().DEERFLOW_NO_COLOR === 'true' || !process.stdout.isTTY;
}
```

---

## 7. 测试规范

### 7.1 命令测试模板

```typescript
// tests/cli/commands/service/start.test.ts

import { Command } from 'commander';
import { registerStartCommand } from '../../../src/cli/commands/service/start';
import { createMockServiceManager } from '../../mocks/serviceManager';
import { CLIError, ErrorCode } from '../../../src/cli/utils/errors';

describe('start command', () => {
  let program: Command;
  let mockServices: ReturnType<typeof createMockServiceManager>;

  beforeEach(() => {
    program = new Command();
    mockServices = createMockServiceManager();
    registerStartCommand(program, mockServices);
  });

  it('should start all services when no names provided', async () => {
    mockServices.start.mockResolvedValue(undefined);
    mockServices.getAllStatus.mockResolvedValue([]);

    await program.parseAsync(['node', 'test', 'start']);

    expect(mockServices.start).toHaveBeenCalledWith({
      only: undefined,
      watch: false,
      detached: false
    });
  });

  it('should start specific services when names provided', async () => {
    mockServices.start.mockResolvedValue(undefined);
    mockServices.getAllStatus.mockResolvedValue([]);

    await program.parseAsync(['node', 'test', 'start', 'gateway', 'core']);

    expect(mockServices.start).toHaveBeenCalledWith(
      expect.objectContaining({
        only: ['gateway', 'core']
      })
    );
  });

  it('should throw CLIError on failure', async () => {
    mockServices.start.mockRejectedValue(new Error('PM2 not found'));

    await expect(
      program.parseAsync(['node', 'test', 'start'])
    ).rejects.toBeInstanceOf(CLIError);
  });
});
```

### 7.2 组件测试模板

```typescript
// tests/cli/components/ServiceTable.test.ts

import { formatServiceTable } from '../../../src/cli/components/ServiceTable';
import type { ServiceStatus } from '../../../src/core/interfaces/IServiceManager';

describe('ServiceTable', () => {
  const mockServices: ServiceStatus[] = [
    {
      name: 'gateway',
      status: 'online',
      cpu: '2%',
      memory: '128 MB',
      uptime: '2h 34m',
      restartCount: 0
    },
    {
      name: 'core',
      status: 'offline',
      restartCount: 3
    }
  ];

  it('should format table with all columns', () => {
    const output = formatServiceTable(mockServices);
    
    expect(output).toContain('gateway');
    expect(output).toContain('online');
    expect(output).toContain('128 MB');
    expect(output).toContain('offline');
  });

  it('should format compact table', () => {
    const output = formatServiceTable(mockServices, { compact: true });
    
    expect(output).toContain('gateway');
    expect(output).not.toContain('PID');  // compact 不显示 PID
  });
});
```

---

## 8. 文档注释规范

```typescript
/**
 * Start DeerFlow services with optional configuration
 * 
 * @param options - Startup options
 * @param options.only - Array of service names to start (empty = all)
 * @param options.watch - Enable config file watching for auto-reload
 * @param options.detached - Run services in background mode
 * @param options.timeout - Maximum startup wait time in seconds
 * 
 * @returns Promise that resolves when services are ready
 * 
 * @throws {CLIError} When service fails to start
 * @throws {CLIError} When timeout is exceeded
 * 
 * @example
 * ```typescript
 * // Start all services
 * await start({});
 * 
 * // Start specific services with watch mode
 * await start({
 *   only: ['gateway', 'core'],
 *   watch: true
 * });
 * ```
 */
async function start(options: StartOptions): Promise<void> {
  // implementation
}
```

---

## 9. 版本控制规范

### 9.1 Commit Message 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type 定义**:
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具

**Scope 定义**:
- `cli`: CLI 相关
- `core`: 核心服务
- `tui`: TUI 界面
- `deps`: 依赖更新

**示例**:
```
feat(cli): add watch mode to start command

Add -w, --watch option to deerflow start command.
When enabled, config file changes trigger automatic service reload.

Closes #123
```

---

## 10. 性能规范

### 10.1 启动时间优化

```typescript
// ✅ 延迟加载重型模块
async function heavyOperation() {
  const { heavyModule } = await import('./heavy-module');
  return heavyModule.process();
}

// ❌ 避免顶层导入重型模块
import { heavyModule } from './heavy-module';  // 会减慢所有命令
```

### 10.2 内存管理

```typescript
// ✅ 使用流式处理大文件
async function* readLargeFile(path: string): AsyncGenerator<string> {
  const stream = createReadStream(path);
  const rl = createInterface(stream);
  
  for await (const line of rl) {
    yield line;
  }
}

// ❌ 避免一次性加载大文件到内存
const content = await fs.readFile(path, 'utf-8');  // 危险！
```

---

## 附录：完整命令清单

### v0.3.0 CLI 命令清单

| 命令                                | 说明         | 常用选项                      |
| ----------------------------------- | ------------ | ----------------------------- |
| `deerflow`                          | 进入交互模式 | -                             |
| `deerflow start [services...]`      | 启动服务     | `-w, --watch`                 |
| `deerflow stop [services...]`       | 停止服务     | `-f, --force`                 |
| `deerflow restart [services...]`    | 重启服务     | -                             |
| `deerflow status [services...]`     | 查看状态     | `-w, --watch`, `-j, --json`   |
| `deerflow logs [services...]`       | 查看日志     | `-f, --follow`, `-n, --lines` |
| `deerflow logs:export <file>`       | 导出日志     | -                             |
| `deerflow logs:clean`               | 清理日志     | `-d, --days`                  |
| `deerflow config init`              | 初始化配置   | `-f, --force`                 |
| `deerflow config get <key>`         | 读取配置     | -                             |
| `deerflow config set <key> <value>` | 设置配置     | -                             |
| `deerflow config validate`          | 验证配置     | -                             |
| `deerflow config edit`              | 编辑配置     | -                             |
| `deerflow doctor`                   | 环境检查     | `--fix`, `--json`             |
| `deerflow dashboard`                | 启动 TUI     | -                             |

---

**文档结束**