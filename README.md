# DeerFlow Launcher

DeerFlow Desktop Launcher - 服务管理与启动工具

## 功能特性

- **环境检测**: 检测 Python 3.12+, Node.js 22+, uv, pnpm, nginx
- **配置初始化**: 从模板文件自动生成配置文件
- **服务管理**: 使用内置 PM2 管理服务生命周期
- **健康检查**: 端口轮询检测服务状态
- **日志管理**: 统一日志输出，支持控制台和文件
- **跨平台支持**: Windows/Linux/macOS 兼容
- **开箱即用**: 打包后无需安装 Node.js 依赖

## 环境要求

### 开发环境
- Node.js 18+
- DeerFlow 仓库已克隆到本地

### 运行环境 (打包后)
- 无需 Node.js 环境
- 单一可执行文件

## 安装

```bash
cd launcher
npm install
```

## 使用方法

### CLI 命令

#### 全局选项

```bash
deerflow-launcher [options] [command]

选项:
  -v, --version                显示版本号
  -d, --deerflow-path <path>   指定 DeerFlow 项目路径
  -p, --use-path <name>        使用配置的命名路径
  -h, --help                   显示帮助信息
```

#### 服务管理

```bash
# 查看帮助
deerflow-launcher --help

# 启动服务
deerflow-launcher start                    # 启动所有服务
deerflow-launcher start langgraph gateway  # 启动指定服务
deerflow-launcher start --detach           # 后台启动

# 停止服务
deerflow-launcher stop                     # 停止所有服务
deerflow-launcher stop langgraph           # 停止指定服务
deerflow-launcher stop --force             # 强制停止

# 查看状态
deerflow-launcher status                   # 查看所有服务状态
deerflow-launcher status langgraph         # 查看指定服务状态
deerflow-launcher status --json            # JSON 格式输出

# 重启服务
deerflow-launcher restart                  # 重启所有服务

# 日志管理
deerflow-launcher logs                     # 查看所有日志
deerflow-launcher logs langgraph           # 查看指定服务日志
deerflow-launcher logs --follow            # 实时跟踪日志

# 环境诊断
deerflow-launcher doctor                   # 检查环境依赖

# 配置管理
deerflow-launcher config init              # 初始化配置文件
deerflow-launcher config show              # 显示当前配置

# 清理
deerflow-launcher clean                    # 清理 PM2 实例
```

### 设置 DeerFlow 路径

Launcher 支持多种方式指定 DeerFlow 项目路径，按优先级排序：

1. **命令行参数** `--deerflow-path <path>`
2. **命名路径** `--use-path <name>` (使用配置的命名路径)
3. **配置文件默认路径** (通过 `config path default` 设置)
4. **环境变量** `DEERFLOW_PATH`
5. **自动查找** (从当前目录向上查找包含 `config.example.yaml` 的目录)

#### 方式一：命令行参数

```bash
# 直接指定路径
deerflow-launcher -d /path/to/deer-flow start

# 或使用完整选项名
deerflow-launcher --deerflow-path /path/to/deer-flow start
```

#### 方式二：配置命名路径

```bash
# 添加路径配置
deerflow-launcher config path add dev /path/to/deer-flow-dev --default
deerflow-launcher config path add prod /path/to/deer-flow-prod

# 使用命名路径
deerflow-launcher -p dev start    # 使用 dev 路径
deerflow-launcher -p prod start   # 使用 prod 路径

# 查看所有配置的路径
deerflow-launcher config path list

# 设置默认路径
deerflow-launcher config path default dev
```

#### 方式三：环境变量

```bash
# Linux/macOS
export DEERFLOW_PATH=/path/to/deer-flow

# Windows PowerShell
$env:DEERFLOW_PATH = "C:\path\to\deer-flow"
```

#### 路径配置命令

```bash
# 添加路径
deerflow-launcher config path add <name> <path> [options]
  --default      设为默认路径
  -d, --description <desc>  路径描述

# 列出所有路径
deerflow-launcher config path list

# 设置默认路径
deerflow-launcher config path default <name>

# 显示路径详情
deerflow-launcher config path show [name]

# 删除路径
deerflow-launcher config path remove <name>
```

#### 配置文件位置

路径配置保存在 `~/.deerflow/launcher.json`：

```json
{
  "paths": [
    { "name": "dev", "path": "/path/to/deer-flow-dev", "description": "开发环境" },
    { "name": "prod", "path": "/path/to/deer-flow-prod", "description": "生产环境" }
  ],
  "defaultPath": "dev"
}
```

### 开发模式

```bash
# 编译 TypeScript
npm run build

# 开发模式 (热重载)
npm run dev

# 运行 CLI
npm run cli -- --help

# 代码检查
npm run lint
```

## 项目结构

```
launcher/
├── src/
│   ├── main.ts                    # 入口文件
│   ├── cli.ts                     # CLI 入口
│   ├── types/
│   │   └── index.ts               # 类型定义
│   ├── core/
│   │   ├── Launcher.ts            # 主启动器
│   │   ├── LaunchContext.ts       # 上下文管理
│   │   └── interfaces/
│   │       └── IServiceManager.ts # 服务管理接口
│   ├── modules/
│   │   ├── EnvChecker.ts          # 环境检测器
│   │   ├── EnvDoctor.ts           # 环境诊断器
│   │   ├── ConfigInitializer.ts   # 配置初始化器
│   │   ├── ConfigWatcher.ts       # 配置文件监控
│   │   ├── ProcessManager.ts      # PM2 进程管理器
│   │   ├── ProcessMonitor.ts      # 进程监控器
│   │   ├── PM2Runtime.ts          # PM2 运行时 (实例隔离)
│   │   ├── PM2ErrorHandler.ts     # PM2 错误处理
│   │   ├── HealthChecker.ts       # 健康检查器
│   │   ├── GracefulShutdown.ts    # 优雅关闭
│   │   ├── LogManager.ts          # 日志管理器
│   │   └── Logger.ts              # 日志记录器
│   ├── cli/
│   │   ├── index.ts               # CLI 主入口
│   │   ├── commands/              # CLI 命令
│   │   │   ├── service/           # 服务管理命令
│   │   │   ├── logs/              # 日志命令
│   │   │   ├── doctor/            # 诊断命令
│   │   │   └── config/            # 配置命令
│   │   └── components/            # CLI 组件
│   ├── config/
│   │   └── services.ts            # 服务定义配置
│   └── utils/
│       ├── errors.ts              # 错误处理工具
│       ├── env.ts                 # 环境变量工具
│       └── format.ts              # 格式化工具
├── scripts/
│   ├── build-release.js           # 发布构建脚本
│   └── wrapper.js                 # PM2 包装脚本
├── spec/                          # 规格文档
├── tests/                         # 测试文件
├── dist/                          # 编译输出
│   ├── src/                       # 编译后的 JS
│   ├── bin/                       # 开发构建输出
│   └── release/                   # 发布包
│       ├── win-x64/
│       ├── linux-x64/
│       └── macos-x64/
├── package.json
├── tsconfig.json
├── eslint.config.js
└── README.md
```

## 服务启动顺序

| 服务 | 端口 | 启动超时 | 说明 |
|------|------|----------|------|
| LangGraph | 2024 | 60s | AI 工作流引擎 |
| Gateway | 8001 | 30s | API 网关 |
| Frontend | 3000 | 120s | 前端应用 |
| Nginx | 2026 | 10s | 反向代理 |

## 配置文件

启动器会自动从模板生成以下配置文件：

- `config.yaml` ← `config.example.yaml`
- `.env` ← `.env.example`
- `frontend/.env` ← `frontend/.env.example`
- `extensions_config.json` ← `extensions_config.example.json`
- `nginx.conf` ← `docker/nginx/nginx.local.conf`

## 构建发布

```bash
# 构建所有平台
npm run build:release

# 单独构建
npm run build:win    # Windows x64
npm run build:linux  # Linux x64
npm run build:mac    # macOS x64
```

构建产物位于 `dist/release/` 目录：
- `deerflow-launcher-v{version}-win-x64.zip`
- `deerflow-launcher-v{version}-linux-x64.tar.gz`
- `deerflow-launcher-v{version}-macos-x64.tar.gz`

## PM2 实例隔离

每个 launcher 实例使用独立的 PM2_HOME 目录：

```
~/.deerflow/pm2-instances/{instance-id}/
├── pm2.pid          # PID 文件
├── logs/            # 日志目录
├── rpc.sock         # RPC Socket
└── pub.sock         # Pub/Sub Socket
```

## 日志级别

设置 `LOG_LEVEL` 环境变量：

```bash
export LOG_LEVEL=debug  # debug, info, warn, error, silent
```

## 调试模式

```bash
export DEBUG_LAUNCHER=true
export LOG_LEVEL=DEBUG
```

## 测试

```bash
# 运行所有测试
npm test

# 仅运行单元测试
npm run test:unit

# 仅运行集成测试
npm run test:integration
```

## 错误处理

启动器定义了以下错误码：

| 错误码 | 说明 |
|--------|------|
| ENV_PYTHON_MISSING | Python 未安装 |
| ENV_NODE_MISSING | Node.js 未安装 |
| ENV_UV_MISSING | uv 未安装 |
| ENV_PNPM_MISSING | pnpm 未安装 |
| ENV_NGINX_MISSING | nginx 未安装 |
| CFG_TEMPLATE_MISSING | 配置模板缺失 |
| CFG_CREATE_FAILED | 配置创建失败 |
| START_DEPENDENCY_FAILED | 依赖服务未就绪 |
| START_PORT_TIMEOUT | 服务启动超时 |
| PM2_CONNECT_FAILED | PM2 连接失败 |
| PM2_PROCESS_NOT_FOUND | 进程未找到 |
| PM2_PERMISSION_DENIED | 权限被拒绝 |
| PM2_PORT_IN_USE | 端口已被占用 |

## 故障排除

详见 [DEERFLOW_LAUNCHER_TROUBLESHOOTING.md](./spec/DEERFLOW_LAUNCHER_TROUBLESHOOTING.md)

## 许可证

MIT
