# Phase 1: 基础设施开发规范

> **阶段目标**: 搭建 TUI 开发基础设施，完成核心组件和 Hooks 开发  
> **预计周期**: Week 1 (7 天)  
> **前置条件**: deerflow-launcher v0.4.0 代码库

---

## 一、阶段目标

### 1.1 总体目标

```
Phase 1 完成标志:
├── ✅ 项目配置完成（依赖、TypeScript、打包）
├── ✅ 目录结构创建
├── ✅ 4 个核心组件实现
├── ✅ 4 个自定义 Hooks 实现
├── ✅ 单元测试覆盖率 > 80%
└── ✅ 开发环境可运行
```

### 1.2 交付物清单

| 交付物 | 文件 | 验收标准 |
|--------|------|----------|
| 项目配置 | package.json, tsconfig.json | 编译通过 |
| ServiceCard | src/tui/components/ServiceCard.tsx | 测试通过 |
| ServiceGrid | src/tui/components/ServiceGrid.tsx | 测试通过 |
| LogPanel | src/tui/components/LogPanel.tsx | 测试通过 |
| CommandInput | src/tui/components/CommandInput.tsx | 测试通过 |
| useServiceStatus | src/tui/hooks/useServiceStatus.ts | 测试通过 |
| useLogStream | src/tui/hooks/useLogStream.ts | 测试通过 |
| useKeyboard | src/tui/hooks/useKeyboard.ts | 测试通过 |
| useTerminalSize | src/tui/hooks/useTerminalSize.ts | 测试通过 |

---

## 二、Day 1-2: 项目配置

### 2.1 依赖安装

#### 生产依赖

```bash
npm install react@18.3.1 ink@4.4.1 ink-spinner@5.0.0 ink-text-input@6.0.0
```

| 依赖 | 版本 | 用途 | 大小 |
|------|------|------|------|
| react | ^18.3.1 | UI 框架 | ~140KB |
| ink | ^4.4.1 | 终端 UI 渲染 | ~50KB |
| ink-spinner | ^5.0.0 | 加载动画 | ~5KB |
| ink-text-input | ^6.0.0 | 文本输入 | ~8KB |

#### 开发依赖

```bash
npm install -D @types/react@18.3.0 @types/node@22.0.0
```

#### package.json 更新

```json
{
  "name": "deerflow-launcher",
  "version": "0.5.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "build:bin": "npm run build && pkg .",
    "dev": "tsx src/cli.ts",
    "dev:ui": "tsx src/cli.ts dashboard",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "dependencies": {
    "react": "^18.3.1",
    "ink": "^4.4.1",
    "ink-spinner": "^5.0.0",
    "ink-text-input": "^6.0.0",
    "pm2": "^6.0.14",
    "commander": "^14.0.3",
    "chalk": "^4.1.2",
    "ora": "^5.4.1",
    "cli-table3": "^0.6.5",
    "inquirer": "^8.2.7"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.9.3",
    "tsx": "^4.19.0",
    "jest": "^29.7.0",
    "@testing-library/react": "^14.0.0",
    "ink-testing-library": "^3.0.0",
    "pkg": "^5.8.1"
  }
}
```

### 2.2 TypeScript 配置

#### tsconfig.json 更新

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts",
    "**/*.test.tsx"
  ]
}
```

#### 关键配置说明

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `jsx` | `react-jsx` | React 17+ 新 JSX 转换 |
| `jsxImportSource` | `react` | JSX 运行时导入源 |
| `moduleResolution` | `bundler` | 支持现代打包工具 |
| `strict` | `true` | 启用所有严格检查 |

### 2.3 目录结构创建

```bash
# 创建 TUI 目录结构
mkdir -p src/tui/components
mkdir -p src/tui/screens
mkdir -p src/tui/hooks
mkdir -p src/tui/context
mkdir -p src/tui/utils
mkdir -p src/tui/__tests__
```

#### 完整目录结构

```
src/tui/
├── index.ts                    # 组件导出入口
│
├── components/                 # 基础组件
│   ├── ServiceCard.tsx         # 服务状态卡片
│   ├── ServiceGrid.tsx         # 服务网格布局
│   ├── LogPanel.tsx            # 日志面板
│   ├── LogLine.tsx             # 单行日志
│   ├── CommandInput.tsx        # 命令输入框
│   ├── StatusBar.tsx           # 状态栏
│   ├── Header.tsx              # 头部标题
│   └── __tests__/              # 组件测试
│       ├── ServiceCard.test.tsx
│       ├── ServiceGrid.test.tsx
│       ├── LogPanel.test.tsx
│       └── CommandInput.test.tsx
│
├── screens/                    # 屏幕组件（Phase 2）
│   └── .gitkeep
│
├── hooks/                      # 自定义 Hooks
│   ├── useServiceStatus.ts     # 服务状态订阅
│   ├── useLogStream.ts         # 日志流订阅
│   ├── useKeyboard.ts          # 键盘事件
│   ├── useTerminalSize.ts      # 终端尺寸
│   └── __tests__/              # Hook 测试
│       ├── useServiceStatus.test.ts
│       ├── useLogStream.test.ts
│       ├── useKeyboard.test.ts
│       └── useTerminalSize.test.ts
│
├── context/                    # React Context（Phase 2）
│   └── .gitkeep
│
├── utils/                      # 工具函数
│   ├── colors.ts               # 颜色定义
│   ├── icons.ts                # 图标定义
│   ├── format.ts               # 格式化工具
│   └── __tests__/
│       └── format.test.ts
│
└── types/                      # 类型定义
    └── index.ts
```

### 2.4 pkg 打包配置

#### package.json pkg 配置

```json
{
  "pkg": {
    "targets": [
      "node22-win-x64",
      "node22-linux-x64",
      "node22-macos-x64"
    ],
    "outputPath": "dist/bin",
    "scripts": [
      "dist/**/*.js"
    ],
    "assets": [
      "node_modules/react/**/*",
      "node_modules/react-dom/**/*",
      "node_modules/ink/**/*",
      "node_modules/ink-spinner/**/*",
      "node_modules/ink-text-input/**/*",
      "node_modules/pm2/**/*",
      "node_modules/@pm2/**/*",
      "scripts/**/*"
    ]
  }
}
```

### 2.5 验收清单

```
Day 1-2 验收:
□ npm install 成功，无依赖冲突
□ npm run build 成功，无 TypeScript 错误
□ 目录结构创建完成
□ .gitignore 更新（忽略 dist/, node_modules/）
□ 测试组件能正常渲染
  └── 创建 src/tui/test.tsx 验证 Ink 工作
```

#### 测试组件

```tsx
// src/tui/test.tsx（临时测试文件）
import React from 'react'
import { render, Text } from 'ink'

const Test = () => <Text color="cyan">Ink is working!</Text>

render(<Test />)
```

```bash
# 运行测试
npx tsx src/tui/test.tsx
# 预期输出: Ink is working! (青色)
```

---

## 三、Day 3-4: 基础组件

### 3.1 类型定义

#### src/tui/types/index.ts

```typescript
/**
 * 服务状态枚举
 */
export enum ServiceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  STARTING = 'starting',
  STOPPING = 'stopping',
  ERROR = 'error',
}

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * 服务信息接口
 */
export interface ServiceInfo {
  name: string
  status: ServiceStatus
  port: number
  pid?: number
  uptime?: string
  cpu?: number
  memory?: number
}

/**
 * 日志条目接口
 */
export interface LogEntry {
  timestamp: string
  service: string
  level: LogLevel
  message: string
}

/**
 * 终端尺寸接口
 */
export interface TerminalSize {
  width: number
  height: number
}
```

### 3.2 工具函数

#### src/tui/utils/colors.ts

```typescript
/**
 * 状态颜色定义
 */
export const STATUS_COLORS = {
  // 服务状态
  ONLINE: 'green',
  OFFLINE: 'gray',
  STARTING: 'yellow',
  STOPPING: 'orange',
  ERROR: 'red',
  
  // 日志级别
  DEBUG: 'gray',
  INFO: 'white',
  WARN: 'yellow',
  ERROR: 'red',
  
  // UI 元素
  PRIMARY: 'cyan',
  SECONDARY: 'gray',
  BORDER: 'gray',
  HIGHLIGHT: 'cyan',
} as const

export type StatusColor = typeof STATUS_COLORS[keyof typeof STATUS_COLORS]
```

#### src/tui/utils/icons.ts

```typescript
/**
 * 状态图标定义
 */
export const STATUS_ICONS = {
  ONLINE: '●',
  OFFLINE: '○',
  STARTING: '◐',
  STOPPING: '◑',
  ERROR: '✗',
  SUCCESS: '✓',
  WARNING: '⚠',
  INFO: 'ℹ',
} as const

/**
 * 进度条配置
 */
export const PROGRESS_BAR = {
  COMPLETE: '█',
  INCOMPLETE: '░',
  WIDTH: 20,
} as const
```

#### src/tui/utils/format.ts

```typescript
/**
 * 格式化内存大小
 */
export function formatMemory(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
}

/**
 * 格式化运行时间
 */
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return `${days}d ${hours}h`
}

/**
 * 格式化时间戳
 */
export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * 创建进度条
 */
export function createProgressBar(percent: number, width = 20): string {
  const complete = Math.floor((percent / 100) * width)
  const incomplete = width - complete
  return `${PROGRESS_BAR.COMPLETE.repeat(complete)}${PROGRESS_BAR.INCOMPLETE.repeat(incomplete)}`
}
```

### 3.3 ServiceCard 组件

#### src/tui/components/ServiceCard.tsx

```tsx
import React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { ServiceStatus } from '../types'
import { STATUS_COLORS, STATUS_ICONS } from '../utils/colors'

/**
 * ServiceCard Props
 */
export interface ServiceCardProps {
  /** 服务名称 */
  name: string
  /** 服务状态 */
  status: ServiceStatus
  /** 端口号 */
  port: number
  /** 进程 ID */
  pid?: number
  /** 运行时间 */
  uptime?: string
  /** CPU 使用率 (%) */
  cpu?: number
  /** 内存使用 (bytes) */
  memory?: number
  /** 是否选中 */
  selected?: boolean
}

/**
 * 状态配置
 */
const STATUS_CONFIG = {
  [ServiceStatus.ONLINE]: {
    icon: STATUS_ICONS.ONLINE,
    color: STATUS_COLORS.ONLINE,
    text: 'Running',
  },
  [ServiceStatus.OFFLINE]: {
    icon: STATUS_ICONS.OFFLINE,
    color: STATUS_COLORS.OFFLINE,
    text: 'Stopped',
  },
  [ServiceStatus.STARTING]: {
    icon: STATUS_ICONS.STARTING,
    color: STATUS_COLORS.STARTING,
    text: 'Starting...',
  },
  [ServiceStatus.STOPPING]: {
    icon: STATUS_ICONS.STOPPING,
    color: STATUS_COLORS.STOPPING,
    text: 'Stopping...',
  },
  [ServiceStatus.ERROR]: {
    icon: STATUS_ICONS.ERROR,
    color: STATUS_COLORS.ERROR,
    text: 'Error',
  },
} as const

/**
 * 服务状态卡片组件
 * 
 * @example
 * ```tsx
 * <ServiceCard
 *   name="langgraph"
 *   status={ServiceStatus.ONLINE}
 *   port={2024}
 *   pid={12345}
 *   selected={true}
 * />
 * ```
 */
export const ServiceCard: React.FC<ServiceCardProps> = ({
  name,
  status,
  port,
  pid,
  uptime,
  cpu,
  memory,
  selected = false,
}) => {
  const config = STATUS_CONFIG[status]
  const isTransitioning = status === ServiceStatus.STARTING || 
                          status === ServiceStatus.STOPPING

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={selected ? STATUS_COLORS.HIGHLIGHT : config.color}
      paddingX={1}
      width={20}
    >
      {/* 服务名称 */}
      <Box>
        <Text bold color={selected ? STATUS_COLORS.HIGHLIGHT : 'white'}>
          {name}
        </Text>
      </Box>

      {/* 状态行 */}
      <Box>
        {isTransitioning ? (
          <>
            <Text color={config.color}>
              <Spinner type="dots" />
            </Text>
            <Text color={config.color}> {config.text}</Text>
          </>
        ) : (
          <Text color={config.color}>
            {config.icon} {config.text}
          </Text>
        )}
      </Box>

      {/* 端口 */}
      <Box>
        <Text dimColor>Port: </Text>
        <Text>{port}</Text>
      </Box>

      {/* PID */}
      {pid && (
        <Box>
          <Text dimColor>PID: </Text>
          <Text>{pid}</Text>
        </Box>
      )}

      {/* 运行时间 */}
      {uptime && status === ServiceStatus.ONLINE && (
        <Box>
          <Text dimColor>Uptime: </Text>
          <Text>{uptime}</Text>
        </Box>
      )}

      {/* 资源使用 */}
      {status === ServiceStatus.ONLINE && (cpu !== undefined || memory !== undefined) && (
        <Box>
          <Text dimColor>
            {cpu !== undefined && `CPU: ${cpu}%`}
            {cpu !== undefined && memory !== undefined && ' | '}
            {memory !== undefined && `Mem: ${formatMemory(memory)}`}
          </Text>
        </Box>
      )}
    </Box>
  )
}

// 导入格式化函数
import { formatMemory } from '../utils/format'
```

#### src/tui/components/__tests__/ServiceCard.test.tsx

```tsx
import React from 'react'
import { render } from 'ink-testing-library'
import { ServiceCard } from '../ServiceCard'
import { ServiceStatus } from '../../types'

describe('ServiceCard', () => {
  const defaultProps = {
    name: 'langgraph',
    status: ServiceStatus.ONLINE,
    port: 2024,
  }

  it('should render service name', () => {
    const { lastFrame } = render(<ServiceCard {...defaultProps} />)
    expect(lastFrame()).toContain('langgraph')
  })

  it('should render port number', () => {
    const { lastFrame } = render(<ServiceCard {...defaultProps} />)
    expect(lastFrame()).toContain('2024')
  })

  it('should show running status for online service', () => {
    const { lastFrame } = render(<ServiceCard {...defaultProps} />)
    expect(lastFrame()).toContain('●')
    expect(lastFrame()).toContain('Running')
  })

  it('should show stopped status for offline service', () => {
    const { lastFrame } = render(
      <ServiceCard {...defaultProps} status={ServiceStatus.OFFLINE} />
    )
    expect(lastFrame()).toContain('○')
    expect(lastFrame()).toContain('Stopped')
  })

  it('should show PID when provided', () => {
    const { lastFrame } = render(
      <ServiceCard {...defaultProps} pid={12345} />
    )
    expect(lastFrame()).toContain('PID:')
    expect(lastFrame()).toContain('12345')
  })

  it('should highlight selected card with cyan border', () => {
    const { lastFrame } = render(
      <ServiceCard {...defaultProps} selected={true} />
    )
    // 快照测试验证边框颜色
    expect(lastFrame()).toMatchSnapshot()
  })
})
```

### 3.4 ServiceGrid 组件

#### src/tui/components/ServiceGrid.tsx

```tsx
import React from 'react'
import { Box } from 'ink'
import { ServiceCard, ServiceCardProps } from './ServiceCard'

/**
 * ServiceGrid Props
 */
export interface ServiceGridProps {
  /** 服务列表 */
  services: ServiceCardProps[]
  /** 选中的服务索引 */
  selectedIndex?: number
  /** 每行列数 */
  columns?: number
}

/**
 * 服务网格布局组件
 * 
 * @example
 * ```tsx
 * <ServiceGrid
 *   services={[
 *     { name: 'langgraph', status: ServiceStatus.ONLINE, port: 2024 },
 *     { name: 'gateway', status: ServiceStatus.ONLINE, port: 8001 },
 *   ]}
 *   selectedIndex={0}
 *   columns={4}
 * />
 * ```
 */
export const ServiceGrid: React.FC<ServiceGridProps> = ({
  services,
  selectedIndex = 0,
  columns = 4,
}) => {
  // 按 columns 分组
  const rows: ServiceCardProps[][] = []
  for (let i = 0; i < services.length; i += columns) {
    rows.push(services.slice(i, i + columns))
  }

  return (
    <Box flexDirection="column" gap={1}>
      {rows.map((row, rowIndex) => (
        <Box key={rowIndex} gap={1}>
          {row.map((service, colIndex) => {
            const globalIndex = rowIndex * columns + colIndex
            return (
              <ServiceCard
                key={service.name}
                {...service}
                selected={globalIndex === selectedIndex}
              />
            )
          })}
        </Box>
      ))}
    </Box>
  )
}
```

### 3.5 LogPanel 组件

#### src/tui/components/LogPanel.tsx

```tsx
import React, { useMemo } from 'react'
import { Box, Text } from 'ink'
import { LogEntry, LogLevel } from '../types'
import { STATUS_COLORS } from '../utils/colors'

/**
 * LogPanel Props
 */
export interface LogPanelProps {
  /** 日志条目数组 */
  logs: LogEntry[]
  /** 显示高度（行数） */
  height?: number
  /** 是否显示服务名称 */
  showService?: boolean
  /** 过滤条件 */
  filter?: {
    service?: string
    level?: LogLevel[]
  }
}

/**
 * 日志级别配置
 */
const LEVEL_CONFIG = {
  [LogLevel.DEBUG]: { color: STATUS_COLORS.DEBUG, label: 'DEBUG' },
  [LogLevel.INFO]: { color: STATUS_COLORS.INFO, label: 'INFO ' },
  [LogLevel.WARN]: { color: STATUS_COLORS.WARN, label: 'WARN ' },
  [LogLevel.ERROR]: { color: STATUS_COLORS.ERROR, label: 'ERROR' },
} as const

/**
 * 日志面板组件
 * 
 * @example
 * ```tsx
 * <LogPanel
 *   logs={logEntries}
 *   height={10}
 *   showService={true}
 * />
 * ```
 */
export const LogPanel: React.FC<LogPanelProps> = ({
  logs,
  height = 10,
  showService = true,
  filter,
}) => {
  // 过滤日志
  const filteredLogs = useMemo(() => {
    let result = logs
    if (filter?.service) {
      result = result.filter(log => log.service === filter.service)
    }
    if (filter?.level) {
      result = result.filter(log => filter.level!.includes(log.level))
    }
    return result
  }, [logs, filter])

  // 取最后 height 条
  const visibleLogs = filteredLogs.slice(-height)

  return (
    <Box 
      flexDirection="column" 
      borderStyle="single" 
      borderColor={STATUS_COLORS.BORDER} 
      paddingX={1}
    >
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold inverse> Logs </Text>
        {filter?.service && (
          <Text dimColor> [{filter.service}]</Text>
        )}
      </Box>
      
      {/* 日志列表 */}
      {visibleLogs.length === 0 ? (
        <Text dimColor>No logs to display</Text>
      ) : (
        visibleLogs.map((log, index) => {
          const levelConfig = LEVEL_CONFIG[log.level]
          return (
            <Box key={index}>
              <Text dimColor>[{log.timestamp}]</Text>
              {showService && (
                <Text color="cyan">[{log.service}]</Text>
              )}
              <Text color={levelConfig.color}> {levelConfig.label} </Text>
              <Text>{log.message}</Text>
            </Box>
          )
        })
      )}
    </Box>
  )
}
```

### 3.6 CommandInput 组件

#### src/tui/components/CommandInput.tsx

```tsx
import React, { useState, useCallback } from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'

/**
 * CommandInput Props
 */
export interface CommandInputProps {
  /** 提交回调 */
  onSubmit: (command: string) => void
  /** 占位符文本 */
  placeholder?: string
  /** 前缀符号 */
  prefix?: string
  /** 历史命令 */
  history?: string[]
}

/**
 * 命令输入组件
 * 
 * @example
 * ```tsx
 * <CommandInput
 *   onSubmit={(cmd) => console.log(cmd)}
 *   placeholder="Enter command..."
 * />
 * ```
 */
export const CommandInput: React.FC<CommandInputProps> = ({
  onSubmit,
  placeholder = 'Enter command...',
  prefix = '>',
  history = [],
}) => {
  const [command, setCommand] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)

  const handleSubmit = useCallback((value: string) => {
    if (value.trim()) {
      onSubmit(value.trim())
      setCommand('')
      setHistoryIndex(-1)
    }
  }, [onSubmit])

  // 历史命令导航（上箭头）
  const handleHistoryUp = useCallback(() => {
    if (history.length > 0 && historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setCommand(history[history.length - 1 - newIndex])
    }
  }, [history, historyIndex])

  // 历史命令导航（下箭头）
  const handleHistoryDown = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setCommand(history[history.length - 1 - newIndex])
    } else if (historyIndex === 0) {
      setHistoryIndex(-1)
      setCommand('')
    }
  }, [history, historyIndex])

  return (
    <Box>
      <Text color="cyan" bold>{prefix} </Text>
      <TextInput
        value={command}
        onChange={setCommand}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        showCursor={true}
      />
    </Box>
  )
}
```

### 3.7 验收清单

```
Day 3-4 验收:
□ ServiceCard 组件
  ├── 显示服务名称、状态、端口
  ├── 支持 5 种状态显示
  ├── 选中状态高亮
  └── 单元测试通过

□ ServiceGrid 组件
  ├── 网格布局正确
  ├── 支持键盘导航
  └── 单元测试通过

□ LogPanel 组件
  ├── 日志列表渲染
  ├── 支持过滤
  └── 单元测试通过

□ CommandInput 组件
  ├── 文本输入正常
  ├── 提交回调触发
  └── 单元测试通过

□ 测试覆盖率 > 80%
```

---

## 四、Day 5-7: Hooks 开发

### 4.1 useServiceStatus Hook

#### src/tui/hooks/useServiceStatus.ts

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { ProcessManager } from '../../modules/ProcessManager'
import { ServiceStatus } from '../types'

/**
 * 服务状态信息
 */
export interface ServiceStatusInfo {
  name: string
  status: ServiceStatus
  port: number
  pid?: number
  uptime?: string
  cpu?: number
  memory?: number
}

/**
 * useServiceStatus 返回值
 */
export interface UseServiceStatusResult {
  /** 服务状态列表 */
  services: ServiceStatusInfo[]
  /** 是否加载中 */
  loading: boolean
  /** 错误信息 */
  error: Error | null
  /** 手动刷新 */
  refresh: () => Promise<void>
}

/**
 * 服务状态订阅 Hook
 * 
 * @param processManager - 进程管理器实例
 * @param interval - 轮询间隔（毫秒）
 * 
 * @example
 * ```tsx
 * const { services, loading, error } = useServiceStatus(processManager, 1000)
 * ```
 */
export function useServiceStatus(
  processManager: ProcessManager,
  interval: number = 1000
): UseServiceStatusResult {
  const [services, setServices] = useState<ServiceStatusInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  
  const mountedRef = useRef(true)

  const fetchStatus = useCallback(async () => {
    if (!mountedRef.current) return
    
    try {
      const statusList = await processManager.getAllStatus()
      
      if (mountedRef.current) {
        setServices(statusList.map(s => ({
          name: s.name,
          status: s.status,
          port: s.port,
          pid: s.pid,
          uptime: s.uptime,
          cpu: s.cpu,
          memory: s.memory,
        })))
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [processManager])

  useEffect(() => {
    mountedRef.current = true
    fetchStatus()
    
    const timer = setInterval(fetchStatus, interval)
    
    return () => {
      mountedRef.current = false
      clearInterval(timer)
    }
  }, [fetchStatus, interval])

  return { services, loading, error, refresh: fetchStatus }
}
```

### 4.2 useLogStream Hook

#### src/tui/hooks/useLogStream.ts

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { LogManager } from '../../modules/LogManager'
import { LogEntry, ServiceName } from '../types'

/**
 * useLogStream 返回值
 */
export interface UseLogStreamResult {
  /** 日志列表 */
  logs: LogEntry[]
  /** 清空日志 */
  clearLogs: () => void
}

/**
 * 日志流订阅 Hook
 * 
 * @param logManager - 日志管理器实例
 * @param services - 过滤的服务列表（可选）
 * @param maxLogs - 最大日志数量
 * 
 * @example
 * ```tsx
 * const { logs, clearLogs } = useLogStream(logManager, undefined, 1000)
 * ```
 */
export function useLogStream(
  logManager: LogManager,
  services?: ServiceName[],
  maxLogs: number = 1000
): UseLogStreamResult {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const batchRef = useRef<LogEntry[]>([])
  const flushTimerRef = useRef<NodeJS.Timeout>()

  // 批量更新日志
  const flush = useCallback(() => {
    if (batchRef.current.length > 0) {
      setLogs(prev => {
        const newLogs = [...prev, ...batchRef.current]
        return newLogs.length > maxLogs ? newLogs.slice(-maxLogs) : newLogs
      })
      batchRef.current = []
    }
  }, [maxLogs])

  useEffect(() => {
    const handleLog = (log: LogEntry) => {
      // 过滤服务
      if (services && !services.includes(log.service as ServiceName)) {
        return
      }
      
      batchRef.current.push(log)
      
      // 每 100ms 批量更新一次
      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(() => {
          flush()
          flushTimerRef.current = undefined
        }, 100)
      }
    }

    const unsubscribe = logManager.subscribe(handleLog)
    
    return () => {
      unsubscribe()
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
      }
    }
  }, [logManager, services, flush])

  const clearLogs = useCallback(() => {
    setLogs([])
    batchRef.current = []
  }, [])

  return { logs, clearLogs }
}
```

### 4.3 useKeyboard Hook

#### src/tui/hooks/useKeyboard.ts

```tsx
import { useInput } from 'ink'

/**
 * 键盘绑定配置
 */
export interface KeyBindings {
  /** 上箭头 */
  up?: () => void
  /** 下箭头 */
  down?: () => void
  /** 左箭头 */
  left?: () => void
  /** 右箭头 */
  right?: () => void
  /** 回车键 */
  enter?: () => void
  /** Escape 键 */
  escape?: () => void
  /** Tab 键 */
  tab?: () => void
  /** 退格键 */
  backspace?: () => void
  /** 删除键 */
  delete?: () => void
  /** 其他按键（小写字母） */
  [key: string]: (() => void) | undefined
}

/**
 * 键盘事件 Hook
 * 
 * @param bindings - 按键绑定配置
 * 
 * @example
 * ```tsx
 * useKeyboard({
 *   left: () => setSelected(s => Math.max(0, s - 1)),
 *   right: () => setSelected(s => Math.min(3, s + 1)),
 *   q: () => exit(),
 * })
 * ```
 */
export function useKeyboard(bindings: KeyBindings): void {
  useInput((input, key) => {
    // 1. 优先处理特殊键
    if (key.upArrow && bindings.up) return bindings.up()
    if (key.downArrow && bindings.down) return bindings.down()
    if (key.leftArrow && bindings.left) return bindings.left()
    if (key.rightArrow && bindings.right) return bindings.right()
    if (key.return && bindings.enter) return bindings.enter()
    if (key.escape && bindings.escape) return bindings.escape()
    if (key.tab && bindings.tab) return bindings.tab()
    if (key.backspace && bindings.backspace) return bindings.backspace()
    if (key.delete && bindings.delete) return bindings.delete()
    
    // 2. 处理字母键（不区分大小写）
    const binding = bindings[input.toLowerCase()]
    if (binding) return binding()
  })
}
```

### 4.4 useTerminalSize Hook

#### src/tui/hooks/useTerminalSize.ts

```tsx
import { useState, useEffect } from 'react'
import { TerminalSize } from '../types'

/**
 * 终端尺寸 Hook
 * 
 * @returns 当前终端尺寸
 * 
 * @example
 * ```tsx
 * const { width, height } = useTerminalSize()
 * ```
 */
export function useTerminalSize(): TerminalSize {
  const [size, setSize] = useState<TerminalSize>({
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24,
  })

  useEffect(() => {
    const handleResize = () => {
      setSize({
        width: process.stdout.columns || 80,
        height: process.stdout.rows || 24,
      })
    }

    process.stdout.on('resize', handleResize)
    
    return () => {
      process.stdout.off('resize', handleResize)
    }
  }, [])

  return size
}
```

### 4.5 验收清单

```
Day 5-7 验收:
□ useServiceStatus Hook
  ├── 初始加载状态正确
  ├── 轮询更新正常
  ├── 错误处理完善
  ├── 组件卸载时清理定时器
  └── 单元测试通过

□ useLogStream Hook
  ├── 日志订阅正常
  ├── 批量更新优化
  ├── 最大数量限制
  ├── 组件卸载时取消订阅
  └── 单元测试通过

□ useKeyboard Hook
  ├── 方向键处理
  ├── 字母键处理
  ├── 特殊键处理
  └── 单元测试通过

□ useTerminalSize Hook
  ├── 初始尺寸正确
  ├── 窗口调整时更新
  ├── 事件监听清理
  └── 单元测试通过

□ 测试覆盖率 > 80%
```

---

## 五、测试规范

### 5.1 Jest 配置

#### jest.config.js

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    'src/tui/**/*.{ts,tsx}',
    '!src/tui/**/__tests__/**',
    '!src/tui/types/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
}
```

### 5.2 测试工具

```bash
npm install -D jest @types/jest ts-jest ink-testing-library @testing-library/react
```

### 5.3 测试覆盖率要求

| 指标 | 要求 |
|------|------|
| 分支覆盖率 | > 80% |
| 函数覆盖率 | > 80% |
| 行覆盖率 | > 80% |
| 语句覆盖率 | > 80% |

---

## 六、验收标准

### 6.1 功能验收

```
□ 所有组件正常渲染
□ 所有 Hook 正常工作
□ 单元测试全部通过
□ 测试覆盖率达标
□ TypeScript 编译无错误
□ pkg 打包成功
```

### 6.2 性能验收

```
□ 组件首次渲染 < 100ms
□ Hook 初始化 < 50ms
□ 内存占用 < 50MB
□ 无内存泄漏
```

### 6.3 代码质量验收

```
□ ESLint 检查通过
□ TypeScript strict 模式无错误
□ 代码格式化一致
□ 注释完整
```

---

## 七、交付清单

### 7.1 文件清单

```
src/tui/
├── index.ts
├── types/index.ts
├── utils/
│   ├── colors.ts
│   ├── icons.ts
│   └── format.ts
├── components/
│   ├── ServiceCard.tsx
│   ├── ServiceGrid.tsx
│   ├── LogPanel.tsx
│   └── CommandInput.tsx
├── hooks/
│   ├── useServiceStatus.ts
│   ├── useLogStream.ts
│   ├── useKeyboard.ts
│   └── useTerminalSize.ts
└── __tests__/
    ├── components/
    │   ├── ServiceCard.test.tsx
    │   ├── ServiceGrid.test.tsx
    │   ├── LogPanel.test.tsx
    │   └── CommandInput.test.tsx
    └── hooks/
        ├── useServiceStatus.test.ts
        ├── useLogStream.test.ts
        ├── useKeyboard.test.ts
        └── useTerminalSize.test.ts
```

### 7.2 文档清单

```
□ README 更新（TUI 模块说明）
□ 组件 API 文档
□ Hook API 文档
□ 测试报告
```

---

*文档版本: v1.0*  
*最后更新: 2026-04-02*
