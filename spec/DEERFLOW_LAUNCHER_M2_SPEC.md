# DeerFlow Launcher M2 开发规范

> 版本: v1.0  
> 目标: Demo 可靠性强化  
> 日期: 2026-03-30

---

## 1. 里程碑目标

M2 核心目标：**让 Demo 达到 24x7 稳定运行水准**，建立可观测性和故障自愈能力，为 GUI 阶段奠定基础。

### 1.1 关键指标

| 指标           | 目标值                   | 测量方式              |
| -------------- | ------------------------ | --------------------- |
| 稳定运行时间   | ≥ 24 小时无崩溃          | 连续运行测试          |
| 服务恢复时间   | ≤ 10 秒                  | 模拟崩溃后恢复        |
| 优雅关闭成功率 | 100%                     | Ctrl+C 测试 10 次     |
| 诊断覆盖率     | 所有依赖项 + 端口 + 配置 | `npm run doctor` 执行 |

---

## 2. 架构原则

### 2.1 保持简单 (KISS)

- **禁止引入重量级框架**：不引入 WebSocket、数据库、复杂状态管理
- **优先使用原生能力**：PM2 原生 API、Node.js 内置模块
- **单文件职责**：每个模块一个核心功能，代码量控制在 300 行以内

### 2.2 渐进增强

- CLI 优先，GUI 后补：所有功能先通过命令行暴露
- 配置即代码：避免复杂配置系统，用 JSON/TypeScript 类型定义
- 向后兼容：M1 的功能必须无损保留

### 2.3 可观测性内建

```typescript
// 所有模块必须实现可观测接口
interface ObservableModule {
  getStatus(): ModuleStatus;
  getMetrics(): MetricsSnapshot;
  onError(handler: ErrorHandler): void;
}
```

---

## 3. 模块规范

### 3.1 ProcessMonitor - 进程监控器

**职责**：基于 `pm2.describe()` 实现定时健康检查

**核心设计**：
```typescript
class ProcessMonitor {
  // 检查间隔: 5 秒（固定，不可配置）
  private readonly CHECK_INTERVAL = 5000;
  
  // 自动重启策略
  private readonly RESTART_POLICY = {
    maxRetries: 3,           // 最大重试次数
    backoffMultiplier: 2,    // 指数退避倍数
    baseDelay: 1000,         // 初始延迟 1s
    maxDelay: 30000          // 最大延迟 30s
  };
  
  // 状态持久化路径
  private readonly STATE_FILE = '.launcher/state.json';
}
```

**输出格式**（`npm run status`）：
```
┌────────────┬──────────┬───────┬─────────┬──────────┬──────────┐
│ Service    │ Status   │ CPU   │ Memory  │ Restarts │ Uptime   │
├────────────┼──────────┼───────┼─────────┼──────────┼──────────┤
│ langgraph  │ online   │ 12%   │ 156MB   │ 0        │ 2h 15m   │
│ gateway    │ online   │ 8%    │ 89MB    │ 0        │ 2h 15m   │
│ frontend   │ online   │ 15%   │ 234MB   │ 0        │ 2h 15m   │
│ nginx      │ online   │ 2%    │ 12MB    │ 0        │ 2h 15m   │
└────────────┴──────────┴───────┴─────────┴──────────┴──────────┘
```

**禁止事项**：
- 禁止直接操作 PM2 的 God Daemon
- 禁止使用 `fs.watch` 监听 PM2 进程文件
- 禁止阻塞主线程的同步检查

---

### 3.2 LogManager - 日志管理器

**职责**：日志分级、轮转、清理

**核心设计**：
```typescript
interface LogConfig {
  // 文件大小阈值
  maxSize: '10m';           // 固定 10MB，不开放配置
  
  // 文件保留数量
  maxFiles: 5;              // 固定 5 个
  
  // 错误分离
  separateErrors: true;     // 错误日志单独存储
  
  // 日志目录结构
  structure: {
    root: './launcher/demo/logs/',
    pattern: '{service}-{type}-{sequence}.log'
  };
}
```

**文件命名规范**：
```
launcher/demo/logs/
├── langgraph-out-0.log          # 标准输出（当前）
├── langgraph-out-1.log          # 轮转历史
├── langgraph-error-0.log        # 错误输出（当前）
├── gateway-out-0.log
├── gateway-error-0.log
└── ...
```

**轮转触发条件**：
1. 文件大小 ≥ 10MB
2. 进程重启时（可选，默认关闭）

---

### 3.3 GracefulShutdown - 优雅关闭器

**职责**：处理 SIGINT/SIGTERM，按序停止服务

**关闭顺序**（严格固定）：
```
Nginx → Frontend → Gateway → LangGraph
```

**超时策略**：
```typescript
const SHUTDOWN_TIMEOUT = {
  graceful: 10000,    // 10s 优雅退出
  forceKill: 5000     // 5s 强制终止兜底
};
```

**信号处理规范**：
```typescript
// 只监听这两个信号
process.on('SIGINT', handleShutdown);   // Ctrl+C
process.on('SIGTERM', handleShutdown);  // kill 命令

// 忽略 SIGUSR1/SIGUSR2（保留给 PM2）
process.on('SIGUSR1', () => {});
process.on('SIGUSR2', () => {});
```

**关闭报告格式**：
```
[INFO] 收到关闭信号 SIGINT，开始优雅关闭...
[INFO] 正在停止 nginx... 成功 (1200ms)
[INFO] 正在停止 frontend... 成功 (3500ms)
[INFO] 正在停止 gateway... 成功 (800ms)
[INFO] 正在停止 langgraph... 成功 (2100ms)
[INFO] 所有服务已停止，退出码: 0
```

---

### 3.4 EnvDoctor - 环境诊断器

**职责**：一键检查运行环境，输出诊断报告

**检查项清单**：

| 类别     | 检查项      | 最低版本 | 命令               |
| -------- | ----------- | -------- | ------------------ |
| 运行时   | Python      | 3.10+    | `python --version` |
| 运行时   | Node.js     | 18+      | `node --version`   |
| 包管理器 | uv          | 0.4+     | `uv --version`     |
| 包管理器 | pnpm        | 8+       | `pnpm --version`   |
| 服务     | Nginx       | 1.20+    | `nginx -v`         |
| 网络     | Port 2024   | 可用     | `netstat` / `lsof` |
| 网络     | Port 8001   | 可用     | `netstat` / `lsof` |
| 网络     | Port 3000   | 可用     | `netstat` / `lsof` |
| 网络     | Port 2026   | 可用     | `netstat` / `lsof` |
| 配置     | config.yaml | 存在     | `fs.existsSync`    |
| 配置     | .env        | 存在     | `fs.existsSync`    |
| 配置     | nginx.conf  | 存在     | `fs.existsSync`    |

**输出符号规范**：
- `[✓]` 通过（绿色）
- `[✗]` 失败（红色）
- `[!]` 警告（黄色）
- `[-]` 跳过（灰色）

**诊断报告生成**：
```bash
npm run doctor              # 终端输出
npm run doctor -- --json    # JSON 格式（供 GUI 使用）
npm run doctor -- --save    # 保存到 .launcher/doctor-report.md
```

---

### 3.5 ConfigWatcher - 配置监听器（轻量版）

**职责**：监听非关键配置变更，热加载支持

**监听范围**（白名单机制）：
```typescript
// 只允许这些配置项热加载
const HOT_RELOADABLE_KEYS = [
  'logging.level',
  'logging.maxFiles',
  'monitor.checkInterval',
  'notifications.enabled'
];
```

**变更处理流程**：
```
文件变更 → 校验 JSON 格式 → 对比白名单 → 应用到运行时 → 记录日志
     ↓
格式错误 → 拒绝加载 → 提示用户 → 保留原配置
     ↓
关键配置变更 → 提示需重启 → 不应用变更
```

**禁止热加载的配置**（变更需重启）：
- 服务端口（2024, 8001, 3000, 2026）
- PM2 执行参数
- 服务启动脚本路径

---

## 4. 代码规范

### 4.1 目录结构

```
launcher/
├── src/
│   ├── core/                 # 核心模块
│   │   ├── ProcessManager.ts
│   │   ├── ProcessMonitor.ts      # M2 新增
│   │   ├── LogManager.ts          # M2 增强
│   │   ├── GracefulShutdown.ts    # M2 新增
│   │   ├── ConfigWatcher.ts       # M2 新增
│   │   └── EnvDoctor.ts           # M2 新增
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   └── validators.ts          # M2 新增（zod schemas）
│   └── index.ts
├── bin/                      # CLI 入口
│   ├── status.ts             # M2 新增
│   ├── doctor.ts             # M2 新增
│   └── logs.ts               # M2 新增
├── config/
│   └── launcher.json         # M2 新增（运行时配置）
├── .launcher/                # 运行时数据（gitignore）
│   ├── state.json            # 状态持久化
│   └── doctor-reports/       # 诊断报告历史
└── demo/logs/                # 日志目录
```

### 4.2 命名规范

| 类型     | 规范             | 示例                   |
| -------- | ---------------- | ---------------------- |
| 类名     | PascalCase       | `ProcessMonitor`       |
| 方法名   | camelCase        | `getStatus()`          |
| 私有属性 | 下划线前缀       | `_checkInterval`       |
| 常量     | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`      |
| 配置文件 | kebab-case       | `launcher-config.json` |
| CLI 命令 | 动词-名词        | `npm run status`       |

### 4.3 错误处理

**统一错误类型**：
```typescript
// errors/LauncherError.ts
class LauncherError extends Error {
  constructor(
    message: string,
    public code: string,           // 错误码，如 PROC_MONITOR_FAILED
    public service?: string,       // 关联服务名
    public recoverable: boolean = false  // 是否可恢复
  ) {
    super(message);
  }
}
```

**错误码规范**：
- `PROC_*`: 进程相关错误
- `CFG_*`: 配置相关错误
- `ENV_*`: 环境相关错误
- `NET_*`: 网络相关错误
- `LOG_*`: 日志相关错误

**日志级别使用**：
- `ERROR`: 需要人工介入的错误
- `WARN`: 可自动恢复的问题
- `INFO`: 正常流程节点
- `DEBUG`: 开发调试信息（生产环境关闭）

---

## 5. CLI 规范

### 5.1 命令清单

| 命令              | 描述         | 示例                                             |
| ----------------- | ------------ | ------------------------------------------------ |
| `npm start`       | 启动所有服务 | `npm start`                                      |
| `npm run status`  | 查看服务状态 | `npm run status [--json]`                        |
| `npm run stop`    | 停止所有服务 | `npm run stop`                                   |
| `npm run doctor`  | 环境诊断     | `npm run doctor [--save]`                        |
| `npm run logs`    | 查看日志     | `npm run logs -- --service=langgraph [--follow]` |
| `npm run restart` | 重启服务     | `npm run restart -- --service=gateway`           |

### 5.2 参数规范

```typescript
// 全局参数
interface GlobalOptions {
  '--json': boolean;        // 输出 JSON 格式
  '--verbose': boolean;     // 详细输出
  '--config': string;       // 指定配置文件路径
}

// logs 专用参数
interface LogsOptions {
  '--service': string;      // 服务名（必需）
  '--follow': boolean;      // 实时跟踪
  '--lines': number;        // 显示行数（默认 50）
  '--errors-only': boolean; // 仅显示错误
}
```

---

## 6. 测试规范

### 6.1 测试分层

```
tests/
├── unit/                   # 单元测试
│   ├── ProcessMonitor.test.ts
│   ├── LogManager.test.ts
│   └── EnvDoctor.test.ts
├── integration/            # 集成测试
│   ├── startup.test.ts     # 启动流程
│   ├── shutdown.test.ts    # 关闭流程
│   └── restart.test.ts     # 重启流程
└── e2e/                    # 端到端测试
    └── stability.test.ts   # 24 小时稳定性
```

### 6.2 测试用例（M2 必测）

| 场景     | 验证点     | 通过标准                    |
| -------- | ---------- | --------------------------- |
| 服务崩溃 | 自动重启   | 3 秒内重启，状态恢复 online |
| 日志轮转 | 文件切分   | 10MB 触发，旧文件保留       |
| 优雅关闭 | 信号处理   | Ctrl+C 10 秒内干净退出      |
| 环境诊断 | 检测覆盖率 | 12 项检查全部执行           |
| 并发检查 | 状态查询   | 100 次状态查询无异常        |

---

## 7. 文档规范

### 7.1 代码注释

**JSDoc 强制要求**：
```typescript
/**
 * 检查服务健康状态
 * @param serviceName - 服务名称
 * @param timeout - 检查超时时间（毫秒）
 * @returns 健康检查结果
 * @throws {LauncherError} 检查超时或 PM2 连接失败
 * @example
 * const result = await monitor.checkHealth('gateway', 5000);
 */
async checkHealth(serviceName: string, timeout: number): Promise<HealthResult> {
  // implementation
}
```

### 7.2 变更日志

**CHANGELOG.md 格式**：
```markdown
## [0.2.0] - 2026-04-XX

### Added
- 进程监控自动重启功能
- 日志轮转和清理
- 优雅关闭信号处理
- 环境诊断工具
- 配置热加载（轻量版）

### Fixed
- M1 遗留的端口占用检测问题

### Changed
- 日志目录结构优化
```

---

## 8. 交付检查清单

### 8.1 代码交付

- [ ] 所有模块通过单元测试（覆盖率 ≥ 80%）
- [ ] 集成测试全部通过
- [ ] ESLint + Prettier 检查通过
- [ ] TypeScript 严格模式无错误
- [ ] 无 `console.log`，全部使用 logger 模块

### 8.2 文档交付

- [ ] README.md 更新（新增 CLI 命令说明）
- [ ] API 文档（TypeDoc 生成）
- [ ] 架构图（Mermaid）
- [ ] 故障排查指南更新

### 8.3 发布交付

- [ ] 版本号更新（package.json）
- [ ] Git Tag 打标 `v0.2.0`
- [ ] Release Notes 编写
- [ ] 升级指南（M1 → M2）

---

## 9. 附录

### 9.1 依赖白名单

**允许使用的第三方库**：

| 库名              | 用途     | 版本约束 |
| ----------------- | -------- | -------- |
| pm2               | 进程管理 | ^5.x     |
| winston           | 日志     | ^3.x     |
| zod               | 配置验证 | ^3.x     |
| systeminformation | 系统信息 | ^5.x     |
| chalk             | CLI 颜色 | ^5.x     |
| commander         | CLI 框架 | ^12.x    |

**禁止引入的库**：
- socket.io / ws（WebSocket，M3 再考虑）
- sqlite / lowdb（数据库）
| dotenv（使用 Node 20 原生 `--env-file`）

### 9.2 参考资源

- [PM2 Programmatic API](https://pm2.keymetrics.io/docs/usage/pm2-api/)
- [Node.js Process Signals](https://nodejs.org/api/process.html#process_signal_events)
- [Winston Transports](https://github.com/winstonjs/winston#transports)

---

**维护者**: DeerFlow Launcher Team  
**审核状态**: Draft → Review → Approved