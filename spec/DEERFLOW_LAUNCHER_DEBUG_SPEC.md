# DeerFlow Launcher Debug 规范

## 版本信息
- **版本**: v0.2.0-demo-debug
- **日期**: 2026-03-30
- **适用阶段**: M1 Demo 调试与问题排查

---

## 1. 调试架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                     Debug 层次架构                           │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: 业务逻辑层    │  Launcher.ts / 各 Module 调试      │
│  Layer 2: 服务管理层    │  PM2 API / 进程监控 / 日志流       │
│  Layer 1: 系统调用层    │  文件操作 / 命令执行 / 网络请求     │
│  Layer 0: 环境层        │  Node.js / TypeScript / 依赖      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 日志级别规范

### 2.1 日志级别定义

| 级别 | 数值 | 用途 | 输出目标 |
|------|------|------|----------|
| `debug` | 0 | 开发调试信息，详细流程追踪 | 控制台 + 文件 |
| `info` | 1 | 正常流程信息 | 控制台 + 文件 |
| `warn` | 2 | 警告信息，非致命问题 | 控制台 + 文件 |
| `error` | 3 | 错误信息，需要处理 | 控制台 + 文件 + 错误追踪 |
| `silent` | 4 | 完全静默 | 无 |

### 2.2 各模块日志规范

#### EnvChecker
```typescript
// ✅ 正确 - 包含检测项和结果
logger.debug(`[EnvChecker] 检测 Python: ${pythonPath}, 版本: ${version}`);
logger.info(`[EnvChecker] ✅ Python ${version} 检测通过`);
logger.error(`[EnvChecker] ❌ Python 检测失败: ${error.message}`);

// ❌ 错误 - 信息不完整
logger.debug('检测中...');
logger.info('通过');
```

#### ConfigInitializer
```typescript
// ✅ 正确 - 包含路径和状态
logger.debug(`[Config] 模板路径: ${templatePath}`);
logger.info(`[Config] ✅ 已生成: ${targetPath}`);
logger.warn(`[Config] ⚠️ 文件已存在，跳过: ${targetPath}`);

// ❌ 错误 - 缺少关键信息
logger.info('配置文件处理完成');
```

#### ProcessManager
```typescript
// ✅ 正确 - 包含 PM2 上下文
logger.debug(`[PM2] 启动服务: ${name}, 脚本: ${script}`);
logger.info(`[PM2] ✅ ${name} 启动成功 (PID: ${pid})`);
logger.error(`[PM2] ❌ ${name} 启动失败: ${error.message}`);

// ❌ 错误 - 没有服务标识
logger.error('启动失败');
```

#### HealthChecker
```typescript
// ✅ 正确 - 包含尝试次数和端口
logger.debug(`[Health] ${serviceName} 检查中 (尝试 ${attempt}/${maxRetries})`);
logger.info(`[Health] ✅ ${serviceName} 健康 (端口 ${port})`);
logger.warn(`[Health] ⏱️ ${serviceName} 健康检查超时`);

// ❌ 错误 - 模糊的描述
logger.debug('检查中');
```

---

## 3. 错误追踪规范

### 3.1 错误码结构

```typescript
interface ErrorInfo {
  code: string;           // 错误码，如 ENV_PYTHON_MISSING
  message: string;        // 用户友好的错误信息
  details?: string;       // 详细技术信息
  suggestion?: string;    // 修复建议
  context?: {             // 错误上下文
    service?: string;
    port?: number;
    path?: string;
    [key: string]: any;
  };
  timestamp: string;      // ISO 8601 格式
  stack?: string;         // 堆栈跟踪（仅 error 级别）
}
```

### 3.2 错误码分类

#### 环境类错误 (ENV_*)
| 错误码 | 触发条件 | 修复建议 |
|--------|----------|----------|
| `ENV_PYTHON_MISSING` | 未检测到 Python | 安装 Python 3.12+ 并添加到 PATH |
| `ENV_PYTHON_VERSION` | 版本低于 3.12 | 升级 Python 到 3.12 或更高版本 |
| `ENV_NODE_MISSING` | 未检测到 Node.js | 安装 Node.js 22+ |
| `ENV_UV_MISSING` | 未检测到 uv | 运行 `pip install uv` 安装 |
| `ENV_PNPM_MISSING` | 未检测到 pnpm | 运行 `npm install -g pnpm` 安装 |
| `ENV_NGINX_MISSING` | 未检测到 nginx | 安装 nginx 并添加到 PATH |
| `ENV_DEERFLOW_PATH` | DEERFLOW_PATH 未设置 | 设置环境变量指向 DeerFlow 仓库 |

#### 配置类错误 (CFG_*)
| 错误码 | 触发条件 | 修复建议 |
|--------|----------|----------|
| `CFG_TEMPLATE_MISSING` | 模板文件不存在 | 检查 DeerFlow 仓库完整性 |
| `CFG_CREATE_FAILED` | 配置文件创建失败 | 检查目录权限和磁盘空间 |
| `CFG_PARSE_FAILED` | 配置文件解析失败 | 检查 YAML/JSON 语法 |

#### 启动类错误 (START_*)
| 错误码 | 触发条件 | 修复建议 |
|--------|----------|----------|
| `START_DEPENDENCY_FAILED` | 前置服务未就绪 | 检查依赖服务日志 |
| `START_PORT_TIMEOUT` | 端口健康检查超时 | 检查服务日志和端口占用 |
| `START_PM2_FAILED` | PM2 启动失败 | 检查 PM2 日志和权限 |
| `START_PROCESS_CRASH` | 进程启动后崩溃 | 查看 PM2 日志：`pm2 logs <name>` |

#### 系统类错误 (SYS_*)
| 错误码 | 触发条件 | 修复建议 |
|--------|----------|----------|
| `SYS_PERMISSION_DENIED` | 权限不足 | 以管理员/ root 运行 |
| `SYS_PORT_IN_USE` | 端口被占用 | 关闭占用端口的进程 |
| `SYS_DISK_FULL` | 磁盘空间不足 | 清理磁盘空间 |
| `SYS_NETWORK_ERROR` | 网络错误 | 检查网络连接 |

---

## 4. 调试模式规范

### 4.1 环境变量配置

```bash
# Linux/macOS
export LOG_LEVEL=debug
export DEBUG_LAUNCHER=true
export DEERFLOW_PATH=/path/to/deer-flow
export PM2_DEBUG=false

# Windows PowerShell
$env:LOG_LEVEL = "debug"
$env:DEBUG_LAUNCHER = "true"
$env:DEERFLOW_PATH = "C:\path\to\deer-flow"
$env:PM2_DEBUG = "false"
```

### 4.2 启动模式

#### 标准模式
```bash
npm start
# 输出：info 及以上级别日志
```

#### 调试模式
```bash
npm run dev
# 输出：debug 及以上级别日志
# 特性：文件变更自动重启、详细堆栈跟踪
```

#### 静默模式
```bash
LOG_LEVEL=silent npm start
# 输出：仅错误信息
```

---

## 5. 常见问题排查手册

### 5.1 环境检测问题

#### Python 检测失败
```
[EnvChecker] ❌ Python 检测失败: Command failed: python3 --version
```

**排查步骤：**
1. 验证 Python 安装：`python --version` 或 `python3 --version`
2. 检查 PATH：`which python` 或 `where python`
3. 版本检查：确保 >= 3.12
4. 日志查看：`DEBUG_LAUNCHER=true npm start` 查看搜索路径

#### uv 检测失败
```
[EnvChecker] ❌ uv 检测失败: Command failed: uv --version
```

**排查步骤：**
1. 安装 uv：`pip install uv`
2. 验证安装：`uv --version`
3. 检查 PATH 中 Python Scripts 目录

### 5.2 PM2 相关问题

#### PM2 连接失败
```
[PM2] ❌ 连接 PM2 daemon 失败: Connection refused
```

**排查步骤：**
1. 检查 PM2 是否已安装：`npm list pm2`
2. 手动启动 PM2 daemon：`pm2 status`
3. 检查权限：确保当前用户有权限访问 PM2
4. 清理 PM2：`pm2 kill && pm2 status`

#### 服务启动后立即退出
```
[PM2] ⚠️ gateway 进程已退出，代码 1
```

**排查步骤：**
1. 查看 PM2 日志：`pm2 logs gateway`
2. 检查配置文件：`cat config.yaml`
3. 手动测试：`cd backend && uv run server.py`
4. 检查依赖：`uv sync` 是否成功

### 5.3 健康检查问题

#### 端口检查超时
```
[Health] ⏱️ gateway 健康检查超时 (端口 8001)
```

**排查步骤：**
1. 检查服务状态：`pm2 status`
2. 查看服务日志：`pm2 logs gateway`
3. 手动测试端口：`curl http://localhost:8001/health`
4. 检查端口占用：`netstat -ano | findstr 8001`

#### 前置依赖未就绪
```
[Launcher] ❌ gateway 依赖 langgraph 未就绪
```

**排查步骤：**
1. 检查 langgraph 状态：`pm2 status langgraph`
2. 查看 langgraph 日志：`pm2 logs langgraph`
3. 验证端口 2024：`curl http://localhost:2024/ok`
4. 检查启动超时：可能需要增加 timeout

### 5.4 配置初始化问题

#### 模板文件缺失
```
[Config] ❌ 模板文件不存在: config.example.yaml
```

**排查步骤：**
1. 验证 DEERFLOW_PATH：`echo $DEERFLOW_PATH`
2. 检查目录结构：`ls $DEERFLOW_PATH`
3. 确认模板存在：`ls $DEERFLOW_PATH/config.example.yaml`
4. 重新克隆 DeerFlow：`git clone https://github.com/bytedance/deer-flow.git`

#### 环境变量替换失败
```
[Config] ⚠️ 环境变量未设置: ${TAVILY_API_KEY}
```

**排查步骤：**
1. 检查 .env 文件：`cat .env`
2. 设置缺失变量：`export TAVILY_API_KEY=your_key`
3. 重新运行配置初始化

---

## 6. 调试工具与方法

### 6.1 内置调试功能

#### 上下文追踪
```typescript
// 在 LaunchContext 中启用详细追踪
const context = new LaunchContext(deerflowPath, {
  verbose: true,  // 记录所有操作
  dryRun: false   // 设置为 true 可模拟运行而不实际执行
});
```

#### 服务状态快照
```typescript
// 获取完整状态快照
const snapshot = {
  timestamp: new Date().toISOString(),
  env: envChecker.getStatus(),
  config: configInitializer.getStatus(),
  processes: await processManager.list(),
  health: healthChecker.getStatus()
};
console.log(JSON.stringify(snapshot, null, 2));
```

### 6.2 外部调试工具

#### PM2 监控
```bash
# 实时监控
pm2 monit

# 查看所有进程
pm2 status

# 查看特定服务日志
pm2 logs <service-name> --lines 100

# 查看服务详情
pm2 describe <service-name>

# 保存当前进程列表
pm2 save

# 生成启动脚本
pm2 startup
```

#### 网络诊断
```bash
# 测试端口连通性
curl -v http://localhost:2024/ok
curl -v http://localhost:8001/health

# 检查端口占用
# Linux/macOS
lsof -i :2024
netstat -tlnp | grep 2024

# Windows
netstat -ano | findstr 2024
Get-Process -Id (Get-NetTCPConnection -LocalPort 2024).OwningProcess
```

#### 进程调试
```bash
# 查看进程树
# Linux/macOS
pstree -p | grep node

# Windows
Get-Process node | Select-Object Id, ProcessName, ParentId

# 查看资源使用
# Linux/macOS
top -p <pid>

# Windows
Get-Process -Id <pid> | Select-Object CPU, WorkingSet
```

### 6.3 日志分析

#### 日志文件位置
```
launcher/demo/
├── logs/
│   ├── launcher.log          # 主启动器日志
│   ├── launcher.error.log    # 错误日志
│   └── debug/                # 调试日志（仅 debug 模式）
│       └── 2026-03-30/
│           └── debug.log
```

#### 日志轮转配置
```typescript
// Logger.ts 中的轮转配置
{
  maxSize: '10m',      // 单个文件最大 10MB
  maxFiles: '7d',      // 保留 7 天
  datePattern: 'YYYY-MM-DD',
  compress: true       // 压缩旧日志
}
```

#### 日志搜索技巧
```bash
# 搜索特定错误码
grep "ENV_PYTHON" logs/launcher.log

# 搜索特定服务
grep "\[gateway\]" logs/launcher.log

# 查看最近的错误
tail -f logs/launcher.error.log

# 按时间范围过滤
awk '/2026-03-30 14:00/,/2026-03-30 15:00/' logs/launcher.log
```

---

## 7. 单元测试调试

### 7.1 运行指定测试

```bash
# 运行所有测试
npm test

# 运行特定模块测试
npm test -- --testPathPattern=EnvChecker
npm test -- --testPathPattern=ProcessManager

# 运行特定测试用例
npm test -- --testNamePattern="should detect Python"

# 带调试信息运行
npm test -- --verbose
```

### 7.2 Jest 调试配置

```javascript
// jest.config.js
module.exports = {
  // ...其他配置
  verbose: true,
  testTimeout: 30000,  // 延长超时时间便于调试
  collectCoverage: true,
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],
  
  // 调试选项
  detectOpenHandles: true,  // 检测未关闭的句柄
  forceExit: true,          // 强制退出
};
```

### 7.3 VS Code 调试配置

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Launcher",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["ts-node", "src/main.ts"],
      "env": {
        "LOG_LEVEL": "debug",
        "DEBUG_LAUNCHER": "true",
        "DEERFLOW_PATH": "${workspaceFolder}/../deer-flow"
      },
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["test", "--", "--runInBand"],
      "console": "integratedTerminal"
    }
  ]
}
```

---

## 8. 性能调试

### 8.1 启动时间分析

```typescript
// 在 main.ts 中添加性能标记
console.time('total-startup');
console.time('env-check');
await envChecker.checkAll();
console.timeEnd('env-check');

console.time('config-init');
await configInitializer.initialize();
console.timeEnd('config-init');

console.time('services-start');
await launcher.startAll();
console.timeEnd('services-start');

console.timeEnd('total-startup');
```

### 8.2 内存使用监控

```typescript
// 内存快照
const memUsage = process.memoryUsage();
console.log({
  rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
  heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
  heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
  external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`
});
```

### 8.3 PM2 性能监控

```bash
# 生成性能报告
pm2 report

# 查看详细指标
pm2 show <service-name>

# 内存监控
pm2 monit
```

---

## 9. 调试输出示例

### 9.1 正常启动流程

```
[2026-03-30T14:30:15.123Z] [INFO] [Launcher] 🚀 DeerFlow Launcher v0.2.0-demo
[2026-03-30T14:30:15.124Z] [DEBUG] [Launcher] DEERFLOW_PATH: /home/user/deer-flow
[2026-03-30T14:30:15.125Z] [DEBUG] [EnvChecker] 检测 Python: python3
[2026-03-30T14:30:15.234Z] [INFO] [EnvChecker] ✅ Python 3.12.2 检测通过
[2026-03-30T14:30:15.235Z] [DEBUG] [EnvChecker] 检测 Node.js: node
[2026-03-30T14:30:15.312Z] [INFO] [EnvChecker] ✅ Node.js 22.5.1 检测通过
[2026-03-30T14:30:15.400Z] [INFO] [EnvChecker] ✅ 所有环境检测通过 (5/5)
[2026-03-30T14:30:15.401Z] [DEBUG] [Config] 检查配置文件: config.yaml
[2026-03-30T14:30:15.402Z] [INFO] [Config] ⚠️ 文件已存在，跳过: config.yaml
[2026-03-30T14:30:15.405Z] [INFO] [Config] ✅ 配置初始化完成
[2026-03-30T14:30:15.406Z] [DEBUG] [PM2] 连接到 PM2 daemon
[2026-03-30T14:30:15.520Z] [DEBUG] [PM2] 启动服务: langgraph, 脚本: langgraph dev
[2026-03-30T14:30:18.234Z] [INFO] [PM2] ✅ langgraph 启动成功 (PID: 12345)
[2026-03-30T14:30:18.235Z] [DEBUG] [Health] langgraph 检查中 (尝试 1/60)
[2026-03-30T14:30:19.456Z] [INFO] [Health] ✅ langgraph 健康 (端口 2024)
[2026-03-30T14:30:19.457Z] [DEBUG] [PM2] 启动服务: gateway
[2026-03-30T14:30:21.789Z] [INFO] [PM2] ✅ gateway 启动成功 (PID: 12346)
...
[2026-03-30T14:32:45.123Z] [INFO] [Launcher] ✅ 所有服务启动完成
```

### 9.2 错误场景示例

#### 环境检测失败
```
[2026-03-30T14:30:15.123Z] [DEBUG] [EnvChecker] 检测 Python: python3
[2026-03-30T14:30:15.124Z] [ERROR] [EnvChecker] ❌ Python 检测失败: Command failed: python3 --version
[2026-03-30T14:30:15.125Z] [DEBUG] [EnvChecker] 尝试备用命令: python
[2026-03-30T14:30:15.126Z] [ERROR] [EnvChecker] ❌ Python 检测失败: Command failed: python --version
[2026-03-30T14:30:15.127Z] [ERROR] [Launcher] 环境检测失败，无法继续启动
[2026-03-30T14:30:15.128Z] [INFO] [Launcher] 💡 建议: 安装 Python 3.12+ 并添加到 PATH
```

#### 服务启动失败
```
[2026-03-30T14:30:20.456Z] [DEBUG] [PM2] 启动服务: gateway
[2026-03-30T14:30:25.678Z] [ERROR] [PM2] ❌ gateway 启动失败: Process failed to start
[2026-03-30T14:30:25.679Z] [DEBUG] [PM2] 进程退出代码: 1
[2026-03-30T14:30:25.680Z] [ERROR] [Launcher] 启动 gateway 失败
[2026-03-30T14:30:25.681Z] [DEBUG] [Launcher] 开始清理已启动服务
[2026-03-30T14:30:25.682Z] [INFO] [Launcher] 🛑 正在停止已启动服务 (2个)
[2026-03-30T14:30:26.123Z] [INFO] [PM2] ✅ langgraph 已停止
[2026-03-30T14:30:26.456Z] [INFO] [PM2] ✅ frontend 已停止
[2026-03-30T14:30:26.457Z] [ERROR] [Launcher] 启动流程失败，请查看日志: logs/launcher.error.log
```

---

## 10. 调试清单

### 10.1 首次运行检查清单

- [ ] `DEERFLOW_PATH` 环境变量已设置
- [ ] DeerFlow 仓库已完整克隆
- [ ] 所有模板文件存在（config.example.yaml, .env.example 等）
- [ ] Python 3.12+ 已安装
- [ ] Node.js 22+ 已安装
- [ ] uv 已安装
- [ ] pnpm 已安装
- [ ] nginx 已安装
- [ ] 端口 2024, 8001, 3000, 2026 未被占用
- [ ] 有足够的磁盘空间（>1GB）
- [ ] 有写入权限

### 10.2 问题报告模板

```markdown
## 问题描述
[清晰描述遇到的问题]

## 环境信息
- OS: [如 Windows 11 / macOS 14 / Ubuntu 22.04]
- Node.js: [如 22.5.1]
- Launcher 版本: [如 v0.2.0-demo]
- DeerFlow 路径: [DEERFLOW_PATH 值]

## 复现步骤
1. [步骤1]
2. [步骤2]
3. [步骤3]

## 实际行为
[描述实际发生的情况]

## 预期行为
[描述预期应该发生的情况]

## 日志输出
```
[粘贴相关日志]
```

## 已尝试的解决方案
[列出已尝试的解决方法]

## 附加信息
[截图、配置文件内容等]
```

---

## 附录：快速命令参考

```bash
# 基础调试
LOG_LEVEL=debug npm start              # 调试模式启动
DEBUG_LAUNCHER=true npm start          # 启用详细追踪

# PM2 调试
pm2 logs                               # 查看所有日志
pm2 logs <name> --lines 200            # 查看特定服务日志
pm2 monit                              # 实时监控
pm2 describe <name>                    # 查看服务详情

# 环境检查
python --version                       # 检查 Python
node --version                         # 检查 Node.js
uv --version                           # 检查 uv
pnpm --version                         # 检查 pnpm
nginx -v                               # 检查 nginx

# 端口检查
curl http://localhost:2024/ok          # 检查 LangGraph
curl http://localhost:8001/health      # 检查 Gateway
netstat -tlnp | grep 2024              # Linux 端口占用
Get-NetTCPConnection -LocalPort 2024   # PowerShell 端口占用
```

---

*文档版本: v0.2.0-demo-debug*  
*最后更新: 2026-03-30*  
*维护者: DeerFlow Launcher Team*
