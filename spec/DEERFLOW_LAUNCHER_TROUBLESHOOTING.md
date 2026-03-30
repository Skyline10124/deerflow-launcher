# DeerFlow Launcher 故障排除指南

本文档记录了在开发和运行 DeerFlow Launcher Demo 过程中遇到的常见问题及其解决方案。

## 目录

1. [PM2 相关问题](#pm2-相关问题)
2. [服务启动问题](#服务启动问题)
3. [配置文件问题](#配置文件问题)
4. [依赖问题](#依赖问题)

---

## PM2 相关问题

### 问题 1: PM2 未安装

**错误信息**:
```
pm2 : 无法将"pm2"项识别为 cmdlet、函数、脚本文件或可运行程序的名称
```

**原因**: PM2 未全局安装

**解决方案**:
```bash
npm install -g pm2
```

---

### 问题 2: PM2.connect is not a function

**错误信息**:
```
[ERROR] [ProcessMgr] Failed to connect to PM2: PM2.connect is not a function
```

**原因**: PM2 是 CommonJS 模块，使用 ES Module 的命名空间导入方式不兼容

**解决方案**: 修改导入语法

```typescript
// 错误写法
import * as PM2 from 'pm2';

// 正确写法
import PM2 from 'pm2';
```

---

### 问题 3: Windows 上 PM2 无法执行 .cmd 文件

**错误信息**:
```
SyntaxError: Invalid or unexpected token
at C:\USERS\ASTRA\APPDATA\ROAMING\NPM\PNPM.CMD:1
@ECHO off
^
```

**原因**: PM2 默认将脚本当作 Node.js 模块执行，而 `pnpm`、`uv`、`nginx` 等命令在 Windows 上是 `.cmd` 批处理文件

**解决方案**: 在 Windows 上使用 `cmd.exe` 作为执行器

```typescript
private buildPM2Config(service: ServiceDefinition): PM2ProcessConfig {
  const isWindows = process.platform === 'win32';
  
  let script = service.script;
  let args = service.args || [];
  let interpreter: string | undefined;
  
  if (isWindows) {
    // Windows: 使用 cmd.exe 执行命令
    script = 'cmd.exe';
    const fullCommand = service.args && service.args.length > 0
      ? `${service.script} ${service.args.join(' ')}`
      : service.script;
    args = ['/c', fullCommand];
    interpreter = undefined;
  } else {
    // Unix: 使用 interpreter: 'none'
    interpreter = 'none';
  }
  
  return { name: service.name, script, args, interpreter, ... };
}
```

---

## 服务启动问题

### 问题 4: LangGraph 启动超时

**错误信息**:
```
[WARN] [HealthCheck] LangGraph (port 2024) health check failed: timeout after 60000ms
```

**可能原因**:
1. `config.yaml` 配置错误
2. 模型配置为空

**排查步骤**:
1. 检查 LangGraph 日志: `./launcher/demo/logs/langgraph-error-0.log`
2. 验证 `config.yaml` 中的 `models` 配置

**示例错误日志**:
```
pydantic_core._pydantic_core.ValidationError: Input should be a valid list [type=list_type, input_value=None]
```

**解决方案**: 确保 `config.yaml` 中 `models` 字段有有效配置

```yaml
models:
  - name: "default"
    provider: "openai"
    model: "gpt-4"
    api_key: "${OPENAI_API_KEY}"
```

---

### 问题 5: Gateway 端口冲突

**错误信息**:
```
[Errno 10048] error while attempting to bind on address ('0.0.0.0', 8001)
```

**原因**: 端口被之前未完全关闭的进程占用

**解决方案**:
```bash
# 清理 PM2 进程
pm2 kill

# 或查找并终止占用端口的进程
netstat -ano | findstr :8001
taskkill /PID <pid> /F
```

---

### 问题 6: Frontend 启动失败 - node_modules 缺失

**错误信息**:
```
'next' 不是内部或外部命令
WARN   Local package.json exists, but node_modules missing, did you mean to install?
```

**原因**: Frontend 目录未安装依赖

**解决方案**:
```bash
cd frontend
pnpm install
```

---

### 问题 7: Nginx 启动失败 - 配置文件不存在

**错误信息**:
```
nginx: [emerg] CreateFile() "E:\Dev\deer-flow\nginx.conf" failed (3: The system cannot find the path specified)
```

**原因**: `nginx.conf` 文件未从模板复制

**解决方案**: 
1. 手动复制:
```bash
cp docker/nginx/nginx.local.conf nginx.conf
```

2. 或更新 `CONFIG_FILE_MAPPINGS` 自动初始化:
```typescript
export const CONFIG_FILE_MAPPINGS: ConfigFileMapping[] = [
  // ... 其他配置
  { template: 'docker/nginx/nginx.local.conf', target: 'nginx.conf' }
];
```

---

### 问题 8: Nginx 启动失败 - 目录不存在

**错误信息**:
```
nginx: [emerg] CreateDirectory() "E:\Dev\deer-flow/temp/client_body_temp" failed (3: The system cannot find the path specified)
nginx: [emerg] CreateFile() "E:\Dev\deer-flow/logs/nginx.pid" failed
```

**原因**: Nginx 需要 `logs/` 和 `temp/` 目录存储日志和临时文件

**解决方案**: 在 `ConfigInitializer` 中自动创建必要目录

```typescript
const NGINX_REQUIRED_DIRS = [
  'logs',
  'temp/client_body_temp',
  'temp/proxy_temp',
  'temp/fastcgi_temp',
  'temp/uwsgi_temp',
  'temp/scgi_temp'
];

private createNginxDirectories(): void {
  for (const dir of NGINX_REQUIRED_DIRS) {
    const dirPath = path.join(this.deerflowPath, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
```

---

## 配置文件问题

### 问题 9: 配置文件初始化顺序

**现象**: 服务启动时找不到必要的配置文件

**解决方案**: 确保以下配置文件在启动前存在:

| 配置文件 | 模板文件 | 用途 |
|---------|---------|------|
| `config.yaml` | `config.example.yaml` | DeerFlow 主配置 |
| `.env` | `.env.example` | 环境变量 |
| `frontend/.env` | `frontend/.env.example` | Frontend 环境变量 |
| `extensions_config.json` | `extensions_config.example.json` | 扩展配置 |
| `nginx.conf` | `docker/nginx/nginx.local.conf` | Nginx 反向代理配置 |

---

## 依赖问题

### 问题 10: 环境依赖检查

**检查命令**:
```bash
# 检查所有依赖版本
python --version    # 需要 3.10+
node --version      # 需要 18+
uv --version        # 需要 0.4+
pnpm --version      # 需要 8+
nginx -v            # 需要 1.20+
```

**安装指南**:
- Python: https://www.python.org/downloads/
- Node.js: https://nodejs.org/
- uv: `pip install uv` 或 https://docs.astral.sh/uv/
- pnpm: `npm install -g pnpm`
- nginx: https://nginx.org/en/download.html

---

## 调试技巧

### 启用调试模式

```bash
# 设置调试环境变量
export DEBUG_LAUNCHER=true
export LOG_LEVEL=DEBUG

# 或在 Windows PowerShell
$env:DEBUG_LAUNCHER="true"
$env:LOG_LEVEL="DEBUG"
```

### 查看日志

```bash
# 查看主日志
cat ./launcher/demo/logs/launcher-$(date +%Y-%m-%d).log

# 查看错误日志
cat ./launcher/demo/logs/launcher-error-$(date +%Y-%m-%d).log

# 查看特定服务日志
cat ./launcher/demo/logs/langgraph-error-0.log
cat ./launcher/demo/logs/frontend-error-2.log
cat ./launcher/demo/logs/nginx-error-3.log
```

### PM2 调试命令

```bash
# 查看进程状态
pm2 list

# 查看进程详情
pm2 show <service-name>

# 查看实时日志
pm2 logs <service-name>

# 查看最近日志
pm2 logs <service-name> --lines 50 --nostream

# 清理所有进程
pm2 kill
```

### Nginx 配置测试

```bash
# 测试配置语法
nginx -t -c /path/to/nginx.conf

# 在项目目录下测试
cd /path/to/deer-flow
nginx -t -c nginx.conf
```

---

## 快速故障排除清单

- [ ] PM2 已全局安装 (`npm install -g pm2`)
- [ ] 所有环境依赖已安装 (Python, Node.js, uv, pnpm, nginx)
- [ ] Frontend 依赖已安装 (`cd frontend && pnpm install`)
- [ ] Backend 依赖已安装 (`cd backend && uv sync`)
- [ ] 配置文件已初始化 (config.yaml, .env, nginx.conf)
- [ ] Nginx 目录已创建 (logs/, temp/)
- [ ] 端口未被占用 (2024, 8001, 3000, 2026)
- [ ] PM2 进程已清理 (`pm2 kill`)

---

## 修复历史

| 日期 | 问题 | 修复文件 |
|------|------|---------|
| 2026-03-30 | PM2 导入语法错误 | `ProcessManager.ts` |
| 2026-03-30 | Windows PM2 执行 .cmd 文件 | `ProcessManager.ts` |
| 2026-03-30 | Frontend node_modules 缺失 | 手动 `pnpm install` |
| 2026-03-30 | nginx.conf 不存在 | `types/index.ts` (CONFIG_FILE_MAPPINGS) |
| 2026-03-30 | Nginx 目录不存在 | `ConfigInitializer.ts` |
