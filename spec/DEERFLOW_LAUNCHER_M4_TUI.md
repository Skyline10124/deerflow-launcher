# DeerFlow Launcher TUI 升级指南：引入 Ink 组件

> **目标**: 将现有 CLI 界面升级为现代化 React + Ink TUI  
> **版本**: v0.4.0 → v0.5.0  
> **周期**: 3-4 周

---

## 一、现有架构分析

### 1.1 当前 CLI 结构

```
src/cli/
├── index.ts              # CLI 主入口 (Commander.js)
├── config.ts             # CLI 配置
├── commands/             # 命令模块
│   ├── service/          # start/stop/restart/status
│   ├── logs/             # logs 命令
│   ├── doctor/           # doctor 诊断
│   └── config/           # config 管理
├── components/           # 现有 UI 组件 (chalk/ora/cli-table3)
└── utils/                # 工具函数
```

### 1.2 现有 UI 组件迁移策略

| 组件 | 库 | 用途 | 迁移策略 |
|------|-----|------|----------|
| **颜色输出** | chalk | 文本着色 | 保留（Ink 兼容） |
| **加载动画** | ora | Spinner | → ink-spinner |
| **表格输出** | cli-table3 | 状态表格 | → 自定义组件 |
| **交互输入** | inquirer | 问答交互 | → ink-text-input |

---

## 二、技术选型

### 2.1 核心依赖

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "ink": "^4.4.1",
    "ink-spinner": "^5.0.0",
    "ink-text-input": "^6.0.0"
  }
}
```

### 2.2 依赖说明

| 依赖 | 版本 | 大小 | 用途 |
|------|------|------|------|
| react | 18.3.1 | ~140KB | UI 框架 |
| ink | 4.4.1 | ~50KB | 终端 UI 渲染 |
| ink-spinner | 5.0.0 | ~5KB | 加载动画 |
| ink-text-input | 6.0.0 | ~8KB | 文本输入 |

**总增加**: ~203KB（gzip 后约 60KB）

---

## 三、目录结构设计

```
src/
├── cli/                      # CLI 入口（保留）
│   └── commands/
│       └── dashboard/        # 🆕 TUI Dashboard
│
├── tui/                      # 🆕 TUI 组件库
│   ├── components/           # 基础组件
│   │   ├── ServiceCard.tsx   # 服务状态卡片
│   │   ├── ServiceGrid.tsx   # 服务网格布局
│   │   ├── LogPanel.tsx      # 日志面板
│   │   ├── CommandInput.tsx  # 命令输入框
│   │   └── StatusBar.tsx     # 状态栏
│   │
│   ├── screens/              # 屏幕组件
│   │   └── DashboardScreen.tsx
│   │
│   └── hooks/                # 自定义 Hooks
│       ├── useServiceStatus.ts
│       ├── useLogStream.ts
│       └── useKeyboard.ts
```

---

## 四、核心组件实现

### 4.1 ServiceCard 组件

```tsx
// src/tui/components/ServiceCard.tsx
import React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'

export interface ServiceCardProps {
  name: string
  status: 'online' | 'offline' | 'starting' | 'stopping'
  port: number
  pid?: number
  selected?: boolean
}

const statusConfig = {
  online: { icon: '●', color: 'green', text: 'Running' },
  offline: { icon: '○', color: 'gray', text: 'Stopped' },
  starting: { icon: '◐', color: 'yellow', text: 'Starting...' },
  stopping: { icon: '◑', color: 'orange', text: 'Stopping...' },
}

export const ServiceCard: React.FC<ServiceCardProps> = ({
  name, status, port, pid, selected = false
}) => {
  const config = statusConfig[status]
  const isTransitioning = status === 'starting' || status === 'stopping'

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={selected ? 'cyan' : config.color}
      paddingX={1}
      width={20}
    >
      <Text bold color={selected ? 'cyan' : 'white'}>{name}</Text>
      
      <Box>
        {isTransitioning ? (
          <Text color={config.color}>
            <Spinner type="dots" /> {config.text}
          </Text>
        ) : (
          <Text color={config.color}>{config.icon} {config.text}</Text>
        )}
      </Box>
      
      <Text dimColor>Port: {port}</Text>
      {pid && <Text dimColor>PID: {pid}</Text>}
    </Box>
  )
}
```

### 4.2 LogPanel 组件

```tsx
// src/tui/components/LogPanel.tsx
import React from 'react'
import { Box, Text } from 'ink'

export interface LogEntry {
  timestamp: string
  service: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface LogPanelProps {
  logs: LogEntry[]
  height?: number
}

const levelColors = {
  info: 'white',
  warn: 'yellow',
  error: 'red',
}

export const LogPanel: React.FC<LogPanelProps> = ({ logs, height = 10 }) => {
  const visibleLogs = logs.slice(-height)

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray">
      <Box marginBottom={1}>
        <Text bold inverse> Logs </Text>
      </Box>
      
      {visibleLogs.map((log, i) => (
        <Box key={i}>
          <Text dimColor>[{log.timestamp}]</Text>
          <Text color="cyan">[{log.service}]</Text>
          <Text color={levelColors[log.level]}> {log.level.toUpperCase()} </Text>
          <Text>{log.message}</Text>
        </Box>
      ))}
    </Box>
  )
}
```

### 4.3 CommandInput 组件

```tsx
// src/tui/components/CommandInput.tsx
import React, { useState } from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'

export interface CommandInputProps {
  onSubmit: (command: string) => void
  placeholder?: string
}

export const CommandInput: React.FC<CommandInputProps> = ({
  onSubmit,
  placeholder = 'Enter command...'
}) => {
  const [command, setCommand] = useState('')

  const handleSubmit = (value: string) => {
    if (value.trim()) {
      onSubmit(value.trim())
      setCommand('')
    }
  }

  return (
    <Box>
      <Text color="cyan" bold>&gt; </Text>
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

---

## 五、自定义 Hooks

### 5.1 useServiceStatus Hook

```tsx
// src/tui/hooks/useServiceStatus.ts
import { useState, useEffect, useCallback } from 'react'
import { ProcessManager } from '../../modules/ProcessManager'

export interface ServiceStatusInfo {
  name: string
  status: string
  port: number
  pid?: number
}

export function useServiceStatus(
  processManager: ProcessManager,
  interval = 1000
) {
  const [services, setServices] = useState<ServiceStatusInfo[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const status = await processManager.getAllStatus()
      setServices(status)
    } finally {
      setLoading(false)
    }
  }, [processManager])

  useEffect(() => {
    fetchStatus()
    const timer = setInterval(fetchStatus, interval)
    return () => clearInterval(timer)
  }, [fetchStatus, interval])

  return { services, loading, refresh: fetchStatus }
}
```

### 5.2 useLogStream Hook

```tsx
// src/tui/hooks/useLogStream.ts
import { useState, useEffect } from 'react'
import { LogManager } from '../../modules/LogManager'

export function useLogStream(logManager: LogManager, maxLogs = 1000) {
  const [logs, setLogs] = useState<any[]>([])

  useEffect(() => {
    const handleLog = (log: any) => {
      setLogs(prev => {
        const newLogs = [...prev, log]
        return newLogs.length > maxLogs ? newLogs.slice(-maxLogs) : newLogs
      })
    }

    return logManager.subscribe(handleLog)
  }, [logManager, maxLogs])

  return { logs, clearLogs: () => setLogs([]) }
}
```

### 5.3 useKeyboard Hook

```tsx
// src/tui/hooks/useKeyboard.ts
import { useInput } from 'ink'

export interface KeyBindings {
  up?: () => void
  down?: () => void
  left?: () => void
  right?: () => void
  [key: string]: (() => void) | undefined
}

export function useKeyboard(bindings: KeyBindings) {
  useInput((input, key) => {
    if (key.upArrow && bindings.up) bindings.up()
    else if (key.downArrow && bindings.down) bindings.down()
    else if (key.leftArrow && bindings.left) bindings.left()
    else if (key.rightArrow && bindings.right) bindings.right()
    else {
      const binding = bindings[input.toLowerCase()]
      if (binding) binding()
    }
  })
}
```

---

## 六、Dashboard 主组件

```tsx
// src/tui/screens/DashboardScreen.tsx
import React, { useState, useCallback } from 'react'
import { Box, Text, useApp } from 'ink'
import { ServiceCard } from '../components/ServiceCard'
import { LogPanel } from '../components/LogPanel'
import { CommandInput } from '../components/CommandInput'
import { useServiceStatus } from '../hooks/useServiceStatus'
import { useLogStream } from '../hooks/useLogStream'
import { useKeyboard } from '../hooks/useKeyboard'
import { Launcher } from '../../core/Launcher'

interface DashboardScreenProps {
  launcher: Launcher
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ launcher }) => {
  const { exit } = useApp()
  const [selected, setSelected] = useState(0)
  
  const { services, loading } = useServiceStatus(launcher.processManager)
  const { logs } = useLogStream(launcher.logManager)

  // 键盘导航
  useKeyboard({
    left: () => setSelected(s => Math.max(0, s - 1)),
    right: () => setSelected(s => Math.min(services.length - 1, s + 1)),
    r: async () => {
      const service = services[selected]
      if (service) await launcher.processManager.restartService(service.name)
    },
    q: () => exit(),
  })

  // 命令处理
  const handleCommand = useCallback(async (cmd: string) => {
    const [action, target] = cmd.split(' ')
    switch (action) {
      case 'start':
        await launcher.processManager.startService(target)
        break
      case 'stop':
        await launcher.processManager.stopService(target)
        break
      case 'exit':
        exit()
        break
    }
  }, [launcher, exit])

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">DeerFlow Launcher Dashboard</Text>
      </Box>

      {/* Service Grid */}
      <Box marginBottom={1} gap={1}>
        {loading ? (
          <Text dimColor>Loading...</Text>
        ) : (
          services.map((service, i) => (
            <ServiceCard
              key={service.name}
              {...service}
              selected={i === selected}
            />
          ))
        )}
      </Box>

      {/* Log Panel */}
      <Box flexGrow={1} marginBottom={1}>
        <LogPanel logs={logs} height={10} />
      </Box>

      {/* Command Input */}
      <CommandInput
        onSubmit={handleCommand}
        placeholder="start/stop/restart [service] | exit"
      />

      {/* Help */}
      <Text dimColor>[←→] Navigate [r] Restart [q] Quit</Text>
    </Box>
  )
}
```

---

## 七、命令入口

```typescript
// src/cli/commands/dashboard/index.ts
import { Command } from 'commander'
import { render } from 'ink'
import React from 'react'
import { DashboardScreen } from '../../../tui/screens/DashboardScreen'
import { Launcher } from '../../../core/Launcher'

export function registerDashboardCommand(program: Command) {
  program
    .command('dashboard')
    .alias('ui')
    .description('Launch interactive TUI dashboard')
    .action(async () => {
      const launcher = await Launcher.create()
      const { waitUntilExit } = render(<DashboardScreen launcher={launcher} />)
      await waitUntilExit()
      await launcher.shutdown()
    })
}
```

---

## 八、渐进式迁移计划

### Phase 1: 基础设施（Week 1）

```
Day 1-2: 项目配置
├── 安装依赖 (react, ink, ink-*)
├── 配置 TypeScript (jsx 支持)
└── 创建目录结构

Day 3-4: 基础组件
├── ServiceCard
├── LogPanel
└── CommandInput

Day 5-7: Hooks 开发
├── useServiceStatus
├── useLogStream
└── useKeyboard
```

### Phase 2: Dashboard 开发（Week 2）

```
Day 1-3: 主屏幕
├── DashboardScreen
├── 键盘导航
└── 命令执行

Day 4-7: 优化与测试
├── 性能优化
├── 跨平台测试
└── 文档编写
```

---

## 九、打包配置

### package.json 更新

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "ink": "^4.4.1",
    "ink-spinner": "^5.0.0",
    "ink-text-input": "^6.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0"
  },
  "pkg": {
    "assets": [
      "node_modules/react/**/*",
      "node_modules/ink/**/*"
    ]
  }
}
```

### tsconfig.json 更新

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

---

## 十、使用示例

### 启动 Dashboard

```bash
deerflow-launcher dashboard
# 或
deerflow-launcher ui
```

### 界面预览

```
┌─────────────────────────────────────────────────────────────┐
│              DeerFlow Launcher Dashboard                    │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │langgraph │ │ gateway  │ │ frontend │ │  nginx   │       │
│  │● Running │ │● Running │ │● Running │ │● Running │       │
│  │Port: 2024│ │Port: 8001│ │Port: 3000│ │Port: 2026│       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├─────────────────────────────────────────────────────────────┤
│  Logs                                                        │
│  [10:30:15] [langgraph] INFO Agent initialized              │
│  [10:30:16] [gateway] INFO Server started                   │
├─────────────────────────────────────────────────────────────┤
│  > start langgraph                                          │
│  [←→] Navigate [r] Restart [q] Quit                         │
└─────────────────────────────────────────────────────────────┘
```

### 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `←` `→` | 导航服务 |
| `r` | 重启选中服务 |
| `s` | 启动/停止选中服务 |
| `q` | 退出 |
| `h` | 显示帮助 |

---

## 十一、总结

### 实施要点

1. **渐进式迁移**: 保留现有命令，新增 `dashboard` 命令
2. **组件化设计**: ServiceCard、LogPanel、CommandInput 可复用
3. **Hooks 抽象**: 状态订阅、日志流、键盘事件逻辑复用
4. **跨平台兼容**: Windows/Linux/macOS 统一行为
5. **pkg 打包**: 确保 Ink 组件正确打包

### 预期成果

| 成果 | 描述 |
|------|------|
| **现代化 UI** | React + Ink 声明式界面 |
| **实时刷新** | 服务状态和日志实时更新 |
| **交互增强** | 键盘导航 + 命令输入 |
| **可扩展** | 组件化架构，易于添加新功能 |
| **向后兼容** | 保留所有现有 CLI 命令 |

---

*文档版本: v1.0*  
*更新时间: 2026-04-02*
