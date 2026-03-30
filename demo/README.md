# DeerFlow Launcher Demo

DeerFlow Desktop Launcher Demo - 基础启动逻辑实现

## 功能特性

- **环境检测**: 检测 Python 3.12+, Node.js 22+, uv, pnpm, nginx
- **配置初始化**: 从模板文件自动生成配置文件
- **服务管理**: 使用 PM2 管理服务生命周期
- **健康检查**: 端口轮询检测服务状态
- **日志管理**: 统一日志输出，支持控制台和文件

## 环境要求

- Node.js 18+
- DeerFlow 仓库已克隆到本地

## 安装

```bash
cd launcher/demo
npm install
```

## 使用方法

### 设置 DeerFlow 路径

```bash
# Linux/macOS
export DEERFLOW_PATH=/path/to/deer-flow

# Windows PowerShell
$env:DEERFLOW_PATH = "C:\path\to\deer-flow"
```

### 运行启动器

```bash
npm start
```

### 开发模式

```bash
npm run dev
```

## 项目结构

```
launcher/demo/
├── src/
│   ├── main.ts                 # 入口文件
│   ├── types/
│   │   └── index.ts            # 类型定义
│   ├── core/
│   │   ├── Launcher.ts         # 主启动器
│   │   └── LaunchContext.ts    # 上下文管理
│   ├── modules/
│   │   ├── EnvChecker.ts       # 环境检测器
│   │   ├── ConfigInitializer.ts # 配置初始化器
│   │   ├── ProcessManager.ts   # 进程管理器
│   │   ├── HealthChecker.ts    # 健康检查器
│   │   └── Logger.ts           # 日志管理器
│   ├── config/
│   │   └── services.ts         # 服务定义配置
│   └── utils/
│       └── errors.ts           # 错误处理工具
├── logs/                       # 日志输出目录
├── tests/
│   ├── unit/                   # 单元测试
│   └── integration/            # 集成测试
├── package.json
├── tsconfig.json
└── README.md
```

## 服务启动顺序

1. **LangGraph** (port 2024, timeout 60s)
2. **Gateway** (port 8001, timeout 30s)
3. **Frontend** (port 3000, timeout 120s)
4. **Nginx** (port 2026, timeout 10s)

## 配置文件

启动器会自动从模板生成以下配置文件：

- `config.yaml` ← `config.example.yaml`
- `.env` ← `.env.example`
- `frontend/.env` ← `frontend/.env.example`
- `extensions_config.json` ← `extensions_config.example.json`

## 日志级别

设置 `LOG_LEVEL` 环境变量：

```bash
export LOG_LEVEL=debug  # debug, info, warn, error
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

## 许可证

MIT
