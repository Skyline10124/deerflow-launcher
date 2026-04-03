# Phase 2: Dashboard 开发规范

> **阶段目标**: 集成组件和 Hooks，实现完整的 Dashboard 交互功能  
> **预计周期**: Week 2 (7 天)  
> **前置条件**: Phase 1 完成，所有基础组件和 Hooks 可用

---

## 一、阶段目标

### 1.1 总体目标

```
Phase 2 完成标志:
├── ✅ DashboardScreen 主屏幕实现
├── ✅ LauncherContext 上下文管理
├── ✅ 键盘导航和快捷键
├── ✅ 命令解析和执行
├── ✅ 状态实时更新
├── ✅ 日志实时显示
├── ✅ 集成测试通过
└── ✅ 跨平台测试通过
```

### 1.2 交付物清单

| 交付物 | 文件 | 验收标准 |
|--------|------|----------|
| DashboardScreen | src/tui/screens/DashboardScreen.tsx | 功能完整 |
| LauncherContext | src/tui/context/LauncherContext.tsx | 状态管理正确 |
| StatusBar | src/tui/components/StatusBar.tsx | 测试通过 |
| dashboard 命令 | src/cli/commands/dashboard/index.ts | 可启动 |
| 集成测试 | src/tui/__tests__/integration/ | 测试通过 |

---

## 二、Day 1-3: 主屏幕开发

### 2.1 LauncherContext 实现

#### src/tui/context/LauncherContext.tsx

```tsx
import React, { createContext, useContext, useMemo } from 'react'
import { Launcher } from '../../core/Launcher'
import { ProcessManager } from '../../modules/ProcessManager'
import { LogManager } from '../../modules/LogManager'

/**
 * LauncherContext 值类型
 */
interface LauncherContextValue {
  /** Launcher 实例 */
  launcher: Launcher
  /** 进程管理器 */
  processManager: ProcessManager
  /** 日志管理器 */
  logManager: LogManager
  /** 版本号 */
  version: string
}

/**
 * Launcher Context
 */
const LauncherContext = createContext<LauncherContextValue | null>(null)

/**
 * LauncherProvider Props
 */
interface LauncherProviderProps {
  /** Launcher 实例 */
  launcher: Launcher
  /** 子组件 */
  children: React.ReactNode
}

/**
 * Launcher Context Provider
 * 
 * @example
 * ```tsx
 * <LauncherProvider launcher={launcher}>
 *   <DashboardScreen />
 * </LauncherProvider>
 * ```
 */
export const LauncherProvider: React.FC<LauncherProviderProps> = ({
  launcher,
  children,
}) => {
  const value = useMemo<LauncherContextValue>(() => ({
    launcher,
    processManager: launcher.processManager,
    logManager: launcher.logManager,
    version: launcher.version,
  }), [launcher])

  return (
    <LauncherContext.Provider value={value}>
      {children}
    </LauncherContext.Provider>
  )
}

/**
 * 获取 Launcher Context
 * 
 * @throws 如果在 LauncherProvider 外使用
 */
export const useLauncher = (): LauncherContextValue => {
  const context = useContext(LauncherContext)
  if (!context) {
    throw new Error('useLauncher must be used within LauncherProvider')
  }
  return context
}

/**
 * 获取进程管理器
 */
export const useProcessManager = (): ProcessManager => {
  const { processManager } = useLauncher()
  return processManager
}

/**
 * 获取日志管理器
 */
export const useLogManager = (): LogManager => {
  const { logManager } = useLauncher()
  return logManager
}
```

### 2.2 StatusBar 组件

#### src/tui/components/StatusBar.tsx

```tsx
import React from 'react'
import { Box, Text } from 'ink'

/**
 * StatusBar Props
 */
export interface StatusBarProps {
  /** 版本号 */
  version: string
  /** 当前模式 */
  mode?: 'normal' | 'insert' | 'visual'
  /** 服务统计 */
  services: {
    total: number
    online: number
    offline: number
  }
  /** 帮助提示 */
  help?: string
}

/**
 * 模式配置
 */
const MODE_CONFIG = {
  normal: 'NORMAL',
  insert: 'INSERT',
  visual: 'VISUAL',
} as const

/**
 * 状态栏组件
 * 
 * @example
 * ```tsx
 * <StatusBar
 *   version="0.5.0"
 *   mode="normal"
 *   services={{ total: 4, online: 3, offline: 1 }}
 *   help="[h] Help [q] Quit"
 * />
 * ```
 */
export const StatusBar: React.FC<StatusBarProps> = ({
  version,
  mode = 'normal',
  services,
  help,
}) => {
  const modeText = MODE_CONFIG[mode]

  return (
    <Box justifyContent="space-between" width="100%">
      {/* 左侧: 版本和服务统计 */}
      <Box>
        <Text inverse bold> DeerFlow Launcher v{version} </Text>
        <Text> </Text>
        <Text dimColor>
          Services:{' '}
          <Text color="green">{services.online}</Text>
          <Text>/{services.total}</Text>
        </Text>
      </Box>
      
      {/* 右侧: 帮助和模式 */}
      <Box>
        {help && <Text dimColor>{help}</Text>}
        <Text> </Text>
        <Text inverse bold> {modeText} </Text>
      </Box>
    </Box>
  )
}
```

### 2.3 DashboardScreen 主组件

#### src/tui/screens/DashboardScreen.tsx

```tsx
import React, { useState, useCallback, useMemo } from 'react'
import { Box, Text, useApp } from 'ink'
import { ServiceGrid } from '../components/ServiceGrid'
import { LogPanel } from '../components/LogPanel'
import { CommandInput } from '../components/CommandInput'
import { StatusBar } from '../components/StatusBar'
import { useServiceStatus } from '../hooks/useServiceStatus'
import { useLogStream } from '../hooks/useLogStream'
import { useKeyboard } from '../hooks/useKeyboard'
import { useTerminalSize } from '../hooks/useTerminalSize'
import { useLauncher, useProcessManager, useLogManager } from '../context/LauncherContext'
import { ServiceStatus, ServiceName } from '../types'

/**
 * DashboardScreen Props
 */
export interface DashboardScreenProps {
  /** 初始选中的服务索引 */
  initialSelected?: number
}

/**
 * Dashboard 主屏幕组件
 * 
 * @example
 * ```tsx
 * <LauncherProvider launcher={launcher}>
 *   <DashboardScreen />
 * </LauncherProvider>
 * ```
 */
export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  initialSelected = 0,
}) => {
  const { exit } = useApp()
  const terminalSize = useTerminalSize()
  const launcher = useLauncher()
  const processManager = useProcessManager()
  const logManager = useLogManager()
  
  // 状态
  const [selectedService, setSelectedService] = useState(initialSelected)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [mode, setMode] = useState<'normal' | 'insert'>('normal')
  const [helpText, setHelpText] = useState('[h] Help [q] Quit [r] Restart [s] Start/Stop')
  const [error, setError] = useState<string | null>(null)
  
  // 服务状态订阅
  const { services, loading, error: statusError, refresh } = useServiceStatus(
    processManager,
    1000
  )
  
  // 日志流订阅
  const { logs, clearLogs } = useLogStream(logManager)

  // 服务列表（用于 ServiceGrid）
  const serviceList = useMemo(() => {
    const serviceNames = [
      ServiceName.LANGGRAPH,
      ServiceName.GATEWAY,
      ServiceName.FRONTEND,
      ServiceName.NGINX,
    ]
    
    return serviceNames.map((name) => {
      const status = services.find(s => s.name === name)
      return {
        name,
        status: status?.status || ServiceStatus.OFFLINE,
        port: status?.port || 0,
        pid: status?.pid,
        uptime: status?.uptime,
        cpu: status?.cpu,
        memory: status?.memory,
      }
    })
  }, [services])

  // 服务统计
  const serviceStats = useMemo(() => ({
    total: serviceList.length,
    online: serviceList.filter(s => s.status === ServiceStatus.ONLINE).length,
    offline: serviceList.filter(s => s.status !== ServiceStatus.ONLINE).length,
  }), [serviceList])

  // 命令处理
  const handleCommand = useCallback(async (command: string) => {
    setCommandHistory(prev => [...prev, command])
    setError(null)
    
    const parts = command.split(' ')
    const cmd = parts[0].toLowerCase()
    const args = parts.slice(1)

    try {
      switch (cmd) {
        case 'start':
          if (args.length > 0) {
            await processManager.startService(args[0] as ServiceName)
            setHelpText(`Started ${args[0]}`)
          } else {
            await launcher.launcher.startAll()
            setHelpText('All services started')
          }
          break
          
        case 'stop':
          if (args.length > 0) {
            await processManager.stopService(args[0] as ServiceName)
            setHelpText(`Stopped ${args[0]}`)
          } else {
            await launcher.launcher.stopAll()
            setHelpText('All services stopped')
          }
          break
          
        case 'restart':
          if (args.length > 0) {
            await processManager.restartService(args[0] as ServiceName)
            setHelpText(`Restarted ${args[0]}`)
          }
          break
          
        case 'status':
          await refresh()
          setHelpText('Status refreshed')
          break
          
        case 'logs':
          // TODO: 切换到日志视图
          setHelpText('Logs view (coming soon)')
          break
          
        case 'clear':
          clearLogs()
          setHelpText('Logs cleared')
          break
          
        case 'exit':
        case 'quit':
        case 'q':
          exit()
          break
          
        default:
          setHelpText(`Unknown command: ${cmd}`)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      setHelpText(`Error: ${errorMsg}`)
    }
  }, [processManager, launcher, refresh, clearLogs, exit])

  // 键盘绑定
  useKeyboard({
    // 导航
    left: () => setSelectedService(prev => Math.max(0, prev - 1)),
    right: () => setSelectedService(prev => Math.min(serviceList.length - 1, prev + 1)),
    up: () => setSelectedService(prev => Math.max(0, prev - 4)),
    down: () => setSelectedService(prev => Math.min(serviceList.length - 1, prev + 4)),
    
    // 服务操作
    r: async () => {
      const service = serviceList[selectedService]
      if (service) {
        try {
          await processManager.restartService(service.name as ServiceName)
          setHelpText(`Restarted ${service.name}`)
        } catch (err) {
          setHelpText(`Error: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    },
    
    s: async () => {
      const service = serviceList[selectedService]
      if (service) {
        try {
          if (service.status === ServiceStatus.ONLINE) {
            await processManager.stopService(service.name as ServiceName)
            setHelpText(`Stopped ${service.name}`)
          } else {
            await processManager.startService(service.name as ServiceName)
            setHelpText(`Started ${service.name}`)
          }
        } catch (err) {
          setHelpText(`Error: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    },
    
    // 其他
    q: () => exit(),
    h: () => setHelpText('Commands: start, stop, restart, status, logs, clear, exit'),
    escape: () => setMode('normal'),
    i: () => setMode('insert'),
  })

  // 计算布局
  const headerHeight = 2
  const serviceGridHeight = 8
  const statusBarHeight = 1
  const commandInputHeight = 1
  const logPanelHeight = Math.max(
    5,
    terminalSize.height - headerHeight - serviceGridHeight - statusBarHeight - commandInputHeight - 4
  )

  return (
    <Box flexDirection="column" height={terminalSize.height} padding={1}>
      {/* Header */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">
          DeerFlow Launcher Dashboard
        </Text>
      </Box>

      {/* Service Grid */}
      <Box marginBottom={1}>
        {loading ? (
          <Text dimColor>Loading services...</Text>
        ) : statusError ? (
          <Text color="red">Error: {statusError.message}</Text>
        ) : (
          <ServiceGrid
            services={serviceList}
            selectedIndex={selectedService}
            columns={4}
          />
        )}
      </Box>

      {/* Log Panel */}
      <Box flexGrow={1} marginBottom={1}>
        <LogPanel
          logs={logs}
          height={logPanelHeight}
          showService={true}
        />
      </Box>

      {/* Error Display */}
      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Command Input */}
      <Box marginBottom={1}>
        <CommandInput
          onSubmit={handleCommand}
          placeholder="start/stop/restart [service] | status | clear | exit"
          history={commandHistory}
        />
      </Box>

      {/* Status Bar */}
      <StatusBar
        version={launcher.version}
        mode={mode}
        services={serviceStats}
        help={helpText}
      />
    </Box>
  )
}
```

### 2.4 Dashboard 命令入口

#### src/cli/commands/dashboard/index.ts

```typescript
import { Command } from 'commander'
import { render } from 'ink'
import React from 'react'
import { DashboardScreen } from '../../../tui/screens/DashboardScreen'
import { LauncherProvider } from '../../../tui/context/LauncherContext'
import { Launcher } from '../../../core/Launcher'

/**
 * 注册 dashboard 命令
 */
export function registerDashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .alias('ui')
    .description('Launch interactive TUI dashboard')
    .option('--no-logs', 'Disable log streaming')
    .action(async (options) => {
      try {
        // 创建 Launcher 实例
        const launcher = await Launcher.create()
        
        // 渲染 Dashboard
        const { waitUntilExit } = render(
          <LauncherProvider launcher={launcher}>
            <DashboardScreen />
          </LauncherProvider>
        )
        
        // 等待退出
        await waitUntilExit()
        
        // 清理
        await launcher.shutdown()
      } catch (error) {
        console.error('Failed to start dashboard:', error)
        process.exit(1)
      }
    })
}
```

### 2.5 CLI 主入口更新

#### src/cli/index.ts

```typescript
import { Command } from 'commander'
import { registerServiceCommands } from './commands/service'
import { registerLogsCommands } from './commands/logs'
import { registerConfigCommands } from './commands/config'
import { registerDoctorCommands } from './commands/doctor'
import { registerDashboardCommand } from './commands/dashboard'  // 🆕

export async function createCLI(): Promise<Command> {
  const program = new Command()
  
  program
    .name('deerflow')
    .description('DeerFlow Desktop Launcher CLI')
    .version(getPackageVersion(), '-v, --version')

  program.exitOverride()

  // 注册命令模块
  registerServiceCommands(program, services)
  registerLogsCommands(program, services)
  registerConfigCommands(program, services)
  registerDoctorCommands(program, services)
  registerDashboardCommand(program)  // 🆕

  return program
}
```

### 2.6 验收清单

```
Day 1-3 验收:
□ LauncherContext
  ├── Provider 正确提供上下文
  ├── useLauncher Hook 正常工作
  └── 错误处理完善

□ StatusBar 组件
  ├── 显示版本号
  ├── 显示服务统计
  └── 显示模式和帮助

□ DashboardScreen 组件
  ├── 布局正确
  ├── 服务状态实时更新
  ├── 日志实时显示
  └── 错误处理完善

□ dashboard 命令
  ├── 命令注册成功
  ├── 能正常启动
  └── 退出时清理资源
```

---

## 三、Day 4-5: 交互功能

### 3.1 键盘导航实现

#### 导航逻辑

```tsx
// 在 DashboardScreen 中
useKeyboard({
  // 左右导航（单个服务）
  left: () => setSelectedService(prev => Math.max(0, prev - 1)),
  right: () => setSelectedService(prev => Math.min(serviceList.length - 1, prev + 1)),
  
  // 上下导航（跨行）
  up: () => setSelectedService(prev => Math.max(0, prev - 4)),  // 4 列布局
  down: () => setSelectedService(prev => Math.min(serviceList.length - 1, prev + 4)),
})
```

#### 边界处理

```tsx
// 确保索引在有效范围内
const safeSetSelected = (newIndex: number) => {
  setSelectedService(Math.max(0, Math.min(serviceList.length - 1, newIndex)))
}
```

### 3.2 服务操作实现

#### 重启服务

```tsx
r: async () => {
  const service = serviceList[selectedService]
  if (!service) return
  
  try {
    setHelpText(`Restarting ${service.name}...`)
    await processManager.restartService(service.name as ServiceName)
    setHelpText(`Restarted ${service.name}`)
  } catch (err) {
    setHelpText(`Error: ${err instanceof Error ? err.message : String(err)}`)
  }
}
```

#### 启动/停止服务

```tsx
s: async () => {
  const service = serviceList[selectedService]
  if (!service) return
  
  try {
    if (service.status === ServiceStatus.ONLINE) {
      setHelpText(`Stopping ${service.name}...`)
      await processManager.stopService(service.name as ServiceName)
      setHelpText(`Stopped ${service.name}`)
    } else {
      setHelpText(`Starting ${service.name}...`)
      await processManager.startService(service.name as ServiceName)
      setHelpText(`Started ${service.name}`)
    }
  } catch (err) {
    setHelpText(`Error: ${err instanceof Error ? err.message : String(err)}`)
  }
}
```

### 3.3 命令解析实现

#### 命令解析器

```tsx
// src/tui/utils/commandParser.ts
export interface ParsedCommand {
  action: string
  target?: string
  args: string[]
}

export function parseCommand(input: string): ParsedCommand {
  const parts = input.trim().split(/\s+/)
  const action = parts[0]?.toLowerCase() || ''
  const target = parts[1]
  const args = parts.slice(2)
  
  return { action, target, args }
}
```

#### 命令执行器

```tsx
// src/tui/utils/commandExecutor.ts
import { ProcessManager } from '../../modules/ProcessManager'
import { ServiceName } from '../types'

export type CommandResult = 
  | { success: true; message: string }
  | { success: false; error: string }

export async function executeCommand(
  command: string,
  processManager: ProcessManager,
  launcher: Launcher
): Promise<CommandResult> {
  const { action, target } = parseCommand(command)
  
  switch (action) {
    case 'start':
      if (target) {
        await processManager.startService(target as ServiceName)
        return { success: true, message: `Started ${target}` }
      } else {
        await launcher.startAll()
        return { success: true, message: 'All services started' }
      }
      
    case 'stop':
      if (target) {
        await processManager.stopService(target as ServiceName)
        return { success: true, message: `Stopped ${target}` }
      } else {
        await launcher.stopAll()
        return { success: true, message: 'All services stopped' }
      }
      
    case 'restart':
      if (target) {
        await processManager.restartService(target as ServiceName)
        return { success: true, message: `Restarted ${target}` }
      }
      return { success: false, error: 'restart requires a service name' }
      
    case 'status':
      return { success: true, message: 'Status refreshed' }
      
    case 'clear':
      return { success: true, message: 'Logs cleared' }
      
    case 'exit':
    case 'quit':
      return { success: true, message: 'Exiting...' }
      
    default:
      return { success: false, error: `Unknown command: ${action}` }
  }
}
```

### 3.4 错误处理实现

#### 错误显示组件

```tsx
// src/tui/components/ErrorDisplay.tsx
import React from 'react'
import { Box, Text } from 'ink'

interface ErrorDisplayProps {
  error: string | null
  onDismiss?: () => void
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onDismiss }) => {
  if (!error) return null
  
  return (
    <Box 
      borderStyle="round" 
      borderColor="red" 
      paddingX={1}
      marginBottom={1}
    >
      <Text color="red">✗ {error}</Text>
      {onDismiss && (
        <Text dimColor> [Press Escape to dismiss]</Text>
      )}
    </Box>
  )
}
```

#### 错误处理 Hook

```tsx
// src/tui/hooks/useError.ts
import { useState, useCallback } from 'react'

export function useError() {
  const [error, setError] = useState<string | null>(null)
  
  const showError = useCallback((message: string) => {
    setError(message)
  }, [])
  
  const clearError = useCallback(() => {
    setError(null)
  }, [])
  
  return { error, showError, clearError }
}
```

### 3.5 验收清单

```
Day 4-5 验收:
□ 键盘导航
  ├── 左右导航正常
  ├── 上下导航正常
  ├── 边界处理正确
  └── 选中状态显示正确

□ 服务操作
  ├── 重启服务正常
  ├── 启动服务正常
  ├── 停止服务正常
  └── 操作反馈显示

□ 命令执行
  ├── 命令解析正确
  ├── 执行成功反馈
  ├── 执行失败反馈
  └── 历史命令记录

□ 错误处理
  ├── 错误显示正常
  ├── 错误清除正常
  └── 不影响其他功能
```

---

## 四、Day 6-7: 优化与测试

### 4.1 性能优化

#### 渲染优化

```tsx
// 使用 useMemo 缓存计算结果
const serviceList = useMemo(() => {
  return serviceNames.map(name => {
    const status = services.find(s => s.name === name)
    return { name, ...status }
  })
}, [services])

// 使用 useCallback 缓存回调
const handleCommand = useCallback(async (cmd: string) => {
  // ...
}, [processManager, launcher])
```

#### 更新频率控制

```tsx
// 服务状态更新间隔
const { services } = useServiceStatus(processManager, 1000)  // 1 秒

// 日志批量更新
const { logs } = useLogStream(logManager, undefined, 1000)  // 最多 1000 条
```

#### 内存优化

```tsx
// 限制日志数量
setLogs(prev => {
  const newLogs = [...prev, log]
  return newLogs.length > 1000 ? newLogs.slice(-1000) : newLogs
})

// 限制历史命令数量
setCommandHistory(prev => {
  const newHistory = [...prev, command]
  return newHistory.slice(-100)  // 最多 100 条
})
```

### 4.2 集成测试

#### DashboardScreen 集成测试

```tsx
// src/tui/__tests__/integration/DashboardScreen.test.tsx
import React from 'react'
import { render } from 'ink-testing-library'
import { DashboardScreen } from '../../screens/DashboardScreen'
import { LauncherProvider } from '../../context/LauncherContext'
import { createMockLauncher } from '../mocks/launcher'

describe('DashboardScreen Integration', () => {
  it('should render all services', () => {
    const mockLauncher = createMockLauncher()
    
    const { lastFrame } = render(
      <LauncherProvider launcher={mockLauncher}>
        <DashboardScreen />
      </LauncherProvider>
    )
    
    expect(lastFrame()).toContain('LangGraph')
    expect(lastFrame()).toContain('Gateway')
    expect(lastFrame()).toContain('Frontend')
    expect(lastFrame()).toContain('Nginx')
  })
  
  it('should show command input', () => {
    const mockLauncher = createMockLauncher()
    
    const { lastFrame } = render(
      <LauncherProvider launcher={mockLauncher}>
        <DashboardScreen />
      </LauncherProvider>
    )
    
    expect(lastFrame()).toContain('>')
  })
  
  it('should show status bar', () => {
    const mockLauncher = createMockLauncher()
    
    const { lastFrame } = render(
      <LauncherProvider launcher={mockLauncher}>
        <DashboardScreen />
      </LauncherProvider>
    )
    
    expect(lastFrame()).toContain('DeerFlow Launcher')
    expect(lastFrame()).toContain('NORMAL')
  })
})
```

#### Mock 工厂

```tsx
// src/tui/__tests__/mocks/launcher.ts
import { Launcher } from '../../../core/Launcher'
import { ProcessManager } from '../../../modules/ProcessManager'
import { LogManager } from '../../../modules/LogManager'
import { ServiceStatus } from '../../types'

export function createMockLauncher(): Launcher {
  return {
    version: '0.5.0-test',
    processManager: createMockProcessManager(),
    logManager: createMockLogManager(),
    shutdown: jest.fn(),
  } as unknown as Launcher
}

export function createMockProcessManager(): ProcessManager {
  return {
    getAllStatus: jest.fn().mockResolvedValue([
      { name: 'langgraph', status: ServiceStatus.ONLINE, port: 2024, pid: 12345 },
      { name: 'gateway', status: ServiceStatus.ONLINE, port: 8001, pid: 12346 },
      { name: 'frontend', status: ServiceStatus.ONLINE, port: 3000, pid: 12347 },
      { name: 'nginx', status: ServiceStatus.ONLINE, port: 2026, pid: 12348 },
    ]),
    startService: jest.fn().mockResolvedValue(undefined),
    stopService: jest.fn().mockResolvedValue(undefined),
    restartService: jest.fn().mockResolvedValue(undefined),
  } as unknown as ProcessManager
}

export function createMockLogManager(): LogManager {
  const subscribers: Array<(log: any) => void> = []
  
  return {
    subscribe: jest.fn((callback) => {
      subscribers.push(callback)
      return () => {
        const index = subscribers.indexOf(callback)
        if (index > -1) subscribers.splice(index, 1)
      }
    }),
    emit: (log: any) => subscribers.forEach(cb => cb(log)),
  } as unknown as LogManager
}
```

### 4.3 跨平台测试

#### 测试脚本

```bash
# scripts/test-cross-platform.sh
#!/bin/bash

echo "Testing on $(uname -s)..."

# 运行单元测试
npm run test

# 运行集成测试
npm run test:integration

# 启动 Dashboard 进行手动测试
timeout 10s npm run dev:ui || true

echo "Cross-platform test completed"
```

#### Windows 测试

```powershell
# scripts/test-windows.ps1
Write-Host "Testing on Windows..."

# 运行测试
npm run test

# 启动 Dashboard
Start-Process -NoNewWindow node -ArgumentList "dist/cli.js", "dashboard"
Start-Sleep -Seconds 5
Stop-Process -Name node -Force

Write-Host "Windows test completed"
```

### 4.4 验收清单

```
Day 6-7 验收:
□ 性能优化
  ├── 渲染性能达标 (< 100ms)
  ├── 内存占用合理 (< 50MB)
  └── 无内存泄漏

□ 集成测试
  ├── 所有测试通过
  ├── 覆盖率达标 (> 80%)
  └── Mock 工厂完善

□ 跨平台测试
  ├── Windows 测试通过
  ├── Linux 测试通过
  └── macOS 测试通过

□ 文档更新
  ├── README 更新
  ├── API 文档完善
  └── 使用示例添加
```

---

## 五、验收标准

### 5.1 功能验收

```
□ Dashboard 正常启动
□ 服务状态实时更新
□ 日志实时显示
□ 键盘导航流畅
□ 命令执行正确
□ 错误处理完善
□ 正常退出和清理
```

### 5.2 性能验收

```
□ 首次渲染 < 200ms
□ 状态更新延迟 < 1s
│  内存占用 < 50MB
│  CPU 占用 < 5%
│  无内存泄漏
```

### 5.3 兼容性验收

```
□ Windows 10/11 测试通过
│  Linux (Ubuntu 22.04) 测试通过
│  macOS 12+ 测试通过
│  终端兼容性测试通过
│    ├── Windows Terminal
│    ├── CMD
│    ├── PowerShell
│    ├── GNOME Terminal
│    ├── iTerm2
│    └── VS Code Terminal
```

---

## 六、交付清单

### 6.1 文件清单

```
src/tui/
├── screens/
│   └── DashboardScreen.tsx
├── context/
│   └── LauncherContext.tsx
├── components/
│   └── StatusBar.tsx
└── __tests__/
    ├── integration/
    │   └── DashboardScreen.test.tsx
    └── mocks/
        └── launcher.ts

src/cli/
└── commands/
    └── dashboard/
        └── index.ts
```

### 6.2 文档清单

```
□ README 更新（Dashboard 使用说明）
□ 快捷键文档
□ 命令列表文档
□ 测试报告
```

---

*文档版本: v1.0*  
*最后更新: 2026-04-02*
