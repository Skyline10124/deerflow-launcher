# Windows PM2 日志捕获问题修复

## 问题概述

在 Windows 环境下，PM2 无法正确捕获 langgraph、gateway、frontend 和 nginx 服务的日志输出，日志文件为空。

## 问题原因

### 1. Windows .cmd 文件执行机制

PM2 在 Windows 上使用 `cmd.exe /c` 执行 `.cmd` 文件（如 `uv run`、`pnpm dev` 等）。这些命令会启动子进程，而子进程的 stdout/stderr 不会被 PM2 的父进程捕获。

```
PM2 -> cmd.exe /c "uv run langgraph dev" -> uv.exe -> python -> langgraph
                                                    ↑
                                            stdout/stderr 在这里丢失
```

### 2. PM2 日志配置问题

- PM2 默认会添加实例 ID 后缀（如 `langgraph-0.log`）
- `merge_logs: true` 在 Windows 上行为不一致
- `NUL` 被当作普通文件名而非空设备

## 解决方案

### 1. 创建 Wrapper 脚本

创建 `scripts/wrapper.js`，使用 Node.js spawn 显式捕获子进程输出：

```javascript
const { spawn } = require('child_process');

const serviceName = process.argv[2];
const command = process.argv[3];
const args = process.argv.slice(4);

function formatLine(line) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${serviceName}] ${line}`;
}

const proc = spawn(fullCommand, [], {
  stdio: ['inherit', 'pipe', 'pipe'],  // 关键：pipe stdout/stderr
  shell: true,
  windowsHide: true,
  env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
});

proc.stdout.on('data', (data) => {
  // 逐行处理，添加时间戳
  process.stdout.write(formatLine(data.toString()));
});

proc.stderr.on('data', (data) => {
  process.stderr.write(formatLine(data.toString()));
});
```

### 2. 修改 ProcessManager 配置

```typescript
// Windows 上使用 wrapper 脚本
if (isWindows) {
  const wrapperPath = path.join(__dirname, '..', '..', 'scripts', 'wrapper.js');
  script = process.execPath;  // Node.js 可执行文件
  args = [wrapperPath, service.name, service.script, ...(service.args || [])];
}

// 禁用 PM2 时间戳（wrapper 已添加）
time: isWindows && !isNodeScript ? false : true,

// 使用 UNC 路径的 NUL 设备
const nullDevice = isWindows ? '\\\\.\\NUL' : '/dev/null';
```

### 3. 统一日志格式

所有服务日志采用统一格式：

```
[ISO时间戳] [服务名] 日志内容
```

示例：
```
[2026-03-30T15:45:10.295Z] [frontend] ✓ Ready in 646ms
[2026-03-30T15:45:07.978Z] [gateway] INFO: Uvicorn running on http://0.0.0.0:8001
```

## 关键修复点

### 1. Windows NUL 设备路径

| 错误写法 | 正确写法 |
|---------|---------|
| `NUL` | `\\\\.\\NUL` |
| `/dev/null` (Linux) | `/dev/null` |

Windows 上 `NUL` 会被 PM2 当作普通文件名创建，使用 UNC 路径 `\\\\.\\NUL` 才能正确识别为空设备。

### 2. 参数转义

```javascript
function escapeShellArg(arg) {
  if (/^[a-zA-Z0-9_\-\.\/\:]+$/.test(arg)) {
    return arg;  // 安全字符不需要转义
  }
  return `"${arg.replace(/"/g, '""')}"`;  // 双引号转义
}
```

### 3. 行缓冲处理

子进程输出可能不是完整行，需要缓冲处理：

```javascript
let stdoutBuffer = '';

proc.stdout.on('data', (data) => {
  stdoutBuffer += data.toString();
  const lines = stdoutBuffer.split('\n');
  stdoutBuffer = lines.pop() || '';  // 保留不完整的行
  lines.forEach(line => {
    if (line.trim()) {
      process.stdout.write(formatLine(line) + '\n');
    }
  });
});
```

## 日志文件结构

修复后的日志结构（扁平结构 + 合并输出 + 固定文件名）：

```
logs/
├── frontend.log      # Frontend 服务日志
├── gateway.log       # Gateway 服务日志
├── langgraph.log     # LangGraph 服务日志
├── launcher.log      # Launcher 主日志
└── nginx.log         # Nginx 服务日志
```

## 测试验证

```powershell
# 清理旧进程和日志
pm2 delete all
Remove-Item -Path "logs/*" -Recurse -Force

# 启动服务
npm run dev

# 验证日志
Get-Content "logs/langgraph.log" -Tail 5
Get-Content "logs/gateway.log" -Tail 5
```

## 相关文件

- `scripts/wrapper.js` - Windows 日志捕获包装脚本
- `src/modules/ProcessManager.ts` - PM2 进程管理配置
- `src/modules/Logger.ts` - Launcher 日志模块

## 注意事项

1. 此方案仅适用于 Windows，Linux/macOS 使用 PM2 原生日志功能
2. wrapper 脚本会增加少量性能开销，但对开发环境影响可忽略
3. 如果服务自身输出已包含时间戳，日志中会有双重时间戳（可接受）
