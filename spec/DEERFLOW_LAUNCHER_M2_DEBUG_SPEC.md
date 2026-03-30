# DeerFlow Launcher M2 调试规范

> 版本: v1.0\
> 目标: M2 阶段问题排查与调试指南\
> 日期: 2026-03-31

***

## 1. 调试环境准备

### 1.1 开启调试模式

```bash
# 方式一：环境变量
export DEBUG_LAUNCHER=true
npm start

# 方式二：命令行参数
npm start -- --debug

# 方式三：日志级别
export LOG_LEVEL=debug
npm start
```

### 1.2 调试目录结构

```
launcher/
├── logs/                    # 运行日志
│   ├── launcher.log         # Launcher 主日志
│   ├── langgraph.log        # LangGraph 服务日志
│   ├── gateway.log          # Gateway 服务日志
│   ├── frontend.log         # Frontend 服务日志
│   └── nginx.log            # Nginx 服务日志
├── .launcher/               # 运行时数据
│   └── state.json           # 状态持久化
└── spec/                    # 规范文档
```

### 1.3 常用调试命令

```bash
# 查看服务状态
npm run cli status

# 环境诊断
npm run cli doctor

# 查看日志（最近 50 行）
npm run cli logs launcher --lines 50

# 实时跟踪日志
npm run cli logs langgraph --follow

# 清理所有进程
npm run clean

# 重新构建
npm run build
```

***

## 2. 模块调试指南

### 2.1 ProcessMonitor 调试

**常见问题**：

| 问题              | 症状                      | 排查步骤                                                    |
| --------------- | ----------------------- | ------------------------------------------------------- |
| PM2 连接失败        | `PM2 connection failed` | 1. 检查 PM2 是否安装2. 检查 PM2 daemon 是否运行3. 尝试 `pm2 kill` 后重启 |
| 进程状态未知          | status 显示 `unknown`     | 1. 检查进程是否在 PM2 列表中2. 检查进程名称是否匹配                         |
| 自动重启失败          | 重启次数超过限制                | 1. 检查服务启动脚本2. 查看服务日志定位崩溃原因                              |
| Windows 内存显示 0B | 无法获取进程内存                | 1. 检查 tasklist 命令是否可用2. 检查进程 PID 是否正确                   |

**Windows 平台限制**：

- PM2 在 Windows 上通过 wrapper 启动进程时，`monit.cpu` 和 `monit.memory` 始终为 0
- 使用 `pwsh` (PowerShell Core) 的 `Get-CimInstance Win32_PerfFormattedData_PerfProc_Process` 获取 CPU 和内存
- 如 `pwsh` 不可用，回退到 `tasklist` 命令（仅内存）

**调试代码**：

```typescript
// 在 ProcessMonitor.ts 中添加调试输出
private async checkProcesses(services: ServiceName[]): Promise<void> {
  this.logger.debug(`Checking processes: ${services.join(', ')}`);
  const processes = await this.listProcesses();
  this.logger.debug(`Found ${processes.length} processes`);
  // ...
}
```

**验证方法**：

```bash
# 1. 启动服务
npm start

# 2. 查看状态
npm run cli status

# 3. 模拟崩溃（手动停止一个服务）
pm2 stop langgraph

# 4. 观察自动重启（等待 5 秒检查周期）
npm run cli status

# 5. 查看日志
npm run cli logs launcher --lines 20
```

***

### 2.2 GracefulShutdown 调试

**常见问题**：

| 问题     | 症状         | 排查步骤                       |
| ------ | ---------- | -------------------------- |
| 信号未捕获  | Ctrl+C 无响应 | 1. 检查信号处理器是否注册2. 检查是否有阻塞操作 |
| 关闭超时   | 强制退出       | 1. 检查服务停止函数2. 增加超时时间       |
| 关闭顺序错误 | 依赖服务先停止    | 1. 检查 shutdownOrder 配置     |

**调试代码**：

```typescript
// 在 GracefulShutdown.ts 中添加调试输出
private async handleShutdown(signal: string): Promise<void> {
  this.logger.debug(`Received signal: ${signal}`);
  this.logger.debug(`isShuttingDown: ${this.isShuttingDown}`);
  // ...
}
```

**验证方法**：

```bash
# 1. 启动服务
npm start

# 2. 等待所有服务就绪

# 3. 发送 SIGINT (Ctrl+C)

# 4. 观察关闭日志
# 预期输出：
# [INFO] 收到关闭信号 SIGINT，开始优雅关闭...
# [INFO] 正在停止 nginx... 成功 (XXXms)
# [INFO] 正在停止 frontend... 成功 (XXXms)
# [INFO] 正在停止 gateway... 成功 (XXXms)
# [INFO] 正在停止 langgraph... 成功 (XXXms)
# [INFO] 所有服务已停止，退出码: 0
```

***

### 2.3 EnvDoctor 调试

**常见问题**：

| 问题       | 症状       | 排查步骤                         |
| -------- | -------- | ---------------------------- |
| 版本检测失败   | 显示未安装    | 1. 检查命令是否在 PATH 中2. 检查版本解析正则 |
| 端口检测误报   | 可用端口显示占用 | 1. 检查是否有其他进程占用2. 检查防火墙设置     |
| 配置文件检测失败 | 存在但显示不存在 | 1. 检查路径是否正确2. 检查文件权限         |

**调试代码**：

```typescript
// 在 EnvDoctor.ts 中添加调试输出
private checkCommand(command: string, minVersion?: string): { ... } {
  this.logger.debug(`Checking command: ${command}`);
  const result = spawnSync(command, [], { ... });
  this.logger.debug(`Output: ${result.stdout}`);
  this.logger.debug(`Error: ${result.stderr}`);
  // ...
}
```

**验证方法**：

```bash
# 运行诊断
npm run cli doctor

# JSON 格式输出
npm run cli doctor -- --json

# 检查特定项
# Python 版本
python --version

# Node.js 版本
node --version

# 端口占用
netstat -ano | findstr "2024"
netstat -ano | findstr "8001"
netstat -ano | findstr "3000"
netstat -ano | findstr "2026"
```

***

### 2.4 LogManager 调试

**常见问题**：

| 问题      | 症状        | 排查步骤                        |
| ------- | --------- | --------------------------- |
| 日志文件未创建 | logs 目录为空 | 1. 检查日志目录权限2. 检查 Logger 初始化 |
| 日志格式错误  | 解析失败      | 1. 检查日志格式正则2. 检查是否有非标准输出    |
| 日志轮转失败  | 文件过大      | 1. 检查轮转触发条件2. 检查文件重命名权限     |

**调试代码**：

```typescript
// 在 LogManager.ts 中添加调试输出
readLogs(filter: LogFilter = {}): LogEntry[] {
  this.logger.debug(`Reading logs with filter: ${JSON.stringify(filter)}`);
  const logFile = this.getLogFilePath(filter.service || 'launcher');
  this.logger.debug(`Log file: ${logFile}`);
  // ...
}
```

**验证方法**：

```bash
# 查看日志文件列表
ls -la logs/

# 查看日志大小
npm run cli logs launcher --lines 100

# 测试日志过滤
npm run cli logs launcher --lines 10

# 检查日志轮转（需要大日志文件）
# 手动创建大文件测试
dd if=/dev/zero of=logs/launcher.log bs=1M count=11
```

***

### 2.5 ConfigWatcher 调试

**常见问题**：

| 问题      | 症状       | 排查步骤                      |
| ------- | -------- | ------------------------- |
| 文件变更未检测 | 修改配置无响应  | 1. 检查文件是否在监听列表2. 检查防抖时间   |
| 重复触发    | 一次变更多次回调 | 1. 检查防抖配置2. 检查编辑器保存行为     |
| 监听器泄漏   | 内存增长     | 1. 检查是否正确关闭监听器2. 检查重复启动监听 |

**调试代码**：

```typescript
// 在 ConfigWatcher.ts 中添加调试输出
private processChange(relativePath: string, event: string): void {
  this.logger.debug(`Processing change: ${relativePath} (${event})`);
  this.logger.debug(`Handlers count: ${this.handlers.length}`);
  // ...
}
```

**验证方法**：

```bash
# 1. 启动服务
npm start

# 2. 修改配置文件
echo "# test change" >> config.yaml

# 3. 观察日志（等待 1 秒防抖）
npm run cli logs launcher --lines 10

# 预期输出：
# [INFO] Config changed: config.yaml
```

***

## 3. 集成调试场景

### 3.1 启动流程调试

```bash
# 完整启动流程调试
DEBUG_LAUNCHER=true npm start 2>&1 | tee startup-debug.log
```

**关键检查点**：

1. 环境检查通过
2. 配置初始化完成
3. PM2 连接成功
4. 服务按顺序启动
5. 健康检查通过

### 3.2 关闭流程调试

```bash
# 启动服务
npm start &

# 等待就绪
sleep 10

# 发送关闭信号
kill -SIGINT $!

# 观察关闭日志
```

**关键检查点**：

1. 信号正确捕获
2. 关闭顺序正确
3. 各服务成功停止
4. 进程干净退出

### 3.3 故障恢复调试

```bash
# 1. 启动服务
npm start

# 2. 手动杀死一个服务进程
pm2 stop langgraph

# 3. 等待监控检测（5 秒）

# 4. 观察自动重启
npm run cli status

# 5. 查看重启日志
npm run cli logs launcher --lines 20
```

***

## 4. 日志分析

### 4.1 日志级别说明

| 级别    | 含义      | 关注度  |
| ----- | ------- | ---- |
| DEBUG | 调试信息    | 开发时  |
| INFO  | 正常流程    | 默认   |
| WARN  | 警告（可恢复） | 需关注  |
| ERROR | 错误（需介入） | 必须处理 |

### 4.2 关键日志模式

**启动成功模式**：

```
[INFO] [ProcessMgr] Starting langgraph service...
[INFO] [ProcessMgr] langgraph is ready
```

**启动失败模式**：

```
[ERROR] [ProcessMgr] Failed to start langgraph: Health check failed
```

**自动重启模式**：

```
[WARN] [ProcMonitor] langgraph process error, attempting restart (1/3)...
[INFO] [ProcMonitor] langgraph restarted successfully
```

**优雅关闭模式**：

```
[INFO] [Shutdown] 收到关闭信号 SIGINT，开始优雅关闭...
[INFO] [Shutdown] 正在停止 nginx... 成功 (1200ms)
```

### 4.3 日志搜索技巧

```bash
# 搜索错误
grep "\[ERROR\]" logs/launcher.log

# 搜索特定服务
grep "\[langgraph\]" logs/launcher.log

# 搜索特定时间段
grep "2026-03-31T10:" logs/launcher.log

# 统计错误数量
grep -c "\[ERROR\]" logs/launcher.log
```

***

## 5. 问题记录模板

### 5.1 问题报告格式

```markdown
## 问题描述
<!-- 简要描述问题 -->

## 复现步骤
1. 
2. 
3. 

## 预期行为
<!-- 描述预期发生什么 -->

## 实际行为
<!-- 描述实际发生什么 -->

## 环境信息
- 操作系统: 
- Node.js 版本: 
- PM2 版本: 
- Launcher 版本: 

## 日志片段
```

<!-- 粘贴相关日志 -->

```

## 已尝试的解决方案
- [ ] 方案1
- [ ] 方案2

## 根因分析
<!-- 问题定位后填写 -->

## 解决方案
<!-- 问题解决后填写 -->
```

### 5.2 问题追踪表

| ID     | 问题   | 状态  | 负责人 | 创建日期       | 解决日期       |
| ------ | ---- | --- | --- | ---------- | ---------- |
| M2-001 | 示例问题 | 已解决 | -   | 2026-03-31 | 2026-03-31 |

***

## 6. 性能调试

### 6.1 内存使用监控

```bash
# 查看进程内存
npm run cli status

# 使用 Node.js 内置分析
node --inspect dist/main.js

# Chrome DevTools
# 打开 chrome://inspect
```

### 6.2 CPU 使用监控

```Shell
# PM2 监控
pm2 monit

# 查看状态
npm run cli status
```

### 6.3 事件循环延迟

```typescript
// 在代码中添加延迟检测
setInterval(() => {
  const start = Date.now();
  setImmediate(() => {
    const delay = Date.now() - start;
    if (delay > 100) {
      logger.warn(`Event loop delay: ${delay}ms`);
    }
  });
}, 5000);
```

***

## 7. 测试验证

### 7.1 单元测试调试

```bash
# 运行单个测试文件
npx jest tests/unit/ProcessMonitor.test.ts --verbose

# 运行并输出 console
npx jest tests/unit/GracefulShutdown.test.ts --verbose --detectOpenHandles

# 调试模式
node --inspect-brk node_modules/.bin/jest tests/unit/Logger.test.ts --runInBand
```

### 7.2 集成测试调试

```bash
# 运行集成测试
npm run test:integration

# 详细输出
npx jest tests/integration/launcher.test.ts --verbose
```

### 7.3 手动测试清单

- [x] 启动所有服务成功
- [x] 查看状态显示正确
- [x] 环境诊断通过
- [x] 日志查看正常
- [x] 实时日志跟踪正常
- [x] 优雅关闭成功
- [x] 服务崩溃自动恢复
- [x] 配置变更检测正常

***

## 8. 常见问题 FAQ

### Q1: PM2 连接失败怎么办？

```bash
# 杀死 PM2 daemon
pm2 kill

# 重新启动
npm start
```

### Q2: 端口被占用怎么办？

```bash
# Windows 查找占用进程
netstat -ano | findstr ":2024"

# 结束进程
taskkill /PID <pid> /F
```

### Q3: 日志文件过大怎么办？

```bash
# 手动清理日志
rm logs/*.log

# 或使用 LogManager
# 日志会在 10MB 时自动轮转
```

### Q4: 服务启动超时怎么办？

```bash
# 检查服务日志
npm run cli logs langgraph --lines 50

# 检查端口是否被占用
netstat -ano | findstr ":2024"

# 检查依赖服务是否就绪
npm run cli status
```

### Q5: 测试出现 open handle 警告？

```bash
# 使用 --forceExit 强制退出
npm test -- --forceExit

# 检查是否有未清理的定时器或 Promise
# 在测试中确保所有 mock 都正确 resolve
```

***

## 9. 调试工具

### 9.1 内置工具

| 工具     | 用途     | 命令                           |
| ------ | ------ | ---------------------------- |
| status | 查看服务状态 | `npm run cli status`         |
| doctor | 环境诊断   | `npm run cli doctor`         |
| logs   | 查看日志   | `npm run cli logs <service>` |
| clean  | 清理进程   | `npm run clean`              |

### 9.2 外部工具

| 工具              | 用途         | 安装                       |
| --------------- | ---------- | ------------------------ |
| PM2             | 进程管理       | `npm install -g pm2`     |
| nodemon         | 开发热重载      | `npm install -g nodemon` |
| Chrome DevTools | Node.js 调试 | 内置                       |

***

**维护者**: DeerFlow Launcher Team\
**更新日期**: 2026-03-31
