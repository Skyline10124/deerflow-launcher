# Phase 3: 高级功能开发规范

> **阶段目标**: 添加高级交互特性，完善用户体验，准备发布  
> **预计周期**: Week 3-4 (14 天)  
> **前置条件**: Phase 2 完成，Dashboard 功能完整

---

## 一、阶段目标

### 1.1 总体目标

```
Phase 3 完成标志:
├── ✅ Vim 模式支持
├── ✅ 主题切换功能
├── ✅ 多屏幕切换（Logs/Config/Help）
├── ✅ 历史命令和自动补全
├── ✅ 帮助系统完善
├── ✅ 配置持久化
├── ✅ 性能监控面板
├── ✅ 发布准备完成
└── ✅ 文档完善
```

### 1.2 交付物清单

| 交付物 | 文件 | 验收标准 |
|--------|------|----------|
| Vim 模式 | src/tui/hooks/useVimMode.ts | 功能完整 |
| 主题系统 | src/tui/context/ThemeContext.tsx | 主题切换 |
| LogsScreen | src/tui/screens/LogsScreen.tsx | 测试通过 |
| ConfigScreen | src/tui/screens/ConfigScreen.tsx | 测试通过 |
| HelpScreen | src/tui/screens/HelpScreen.tsx | 测试通过 |
| 帮助面板 | src/tui/components/HelpPanel.tsx | 测试通过 |
| 自动补全 | src/tui/components/AutoComplete.tsx | 测试通过 |
| 配置持久化 | src/tui/utils/configStorage.ts | 测试通过 |

---

## 二、Week 3: 高级特性

### 2.1 Day 1-2: Vim 模式支持

#### useVimMode Hook

```tsx
// src/tui/hooks/useVimMode.ts
import { useState, useCallback } from 'react'

/**
 * Vim 模式类型
 */
export type VimMode = 'normal' | 'insert' | 'visual'

/**
 * useVimMode 返回值
 */
export interface UseVimModeResult {
  /** 当前模式 */
  mode: VimMode
  /** 设置模式 */
  setMode: (mode: VimMode) => void
  /** 进入普通模式 */
  enterNormal: () => void
  /** 进入插入模式 */
  enterInsert: () => void
  /** 进入可视模式 */
  enterVisual: () => void
  /** 是否为普通模式 */
  isNormal: boolean
  /** 是否为插入模式 */
  isInsert: boolean
  /** 是否为可视模式 */
  isVisual: boolean
}

/**
 * Vim 模式管理 Hook
 * 
 * @example
 * ```tsx
 * const { mode, enterInsert, enterNormal } = useVimMode()
 * 
 * useKeyboard({
 *   i: () => isNormal && enterInsert(),
 *   escape: () => enterNormal(),
 * })
 * ```
 */
export function useVimMode(initialMode: VimMode = 'normal'): UseVimModeResult {
  const [mode, setMode] = useState<VimMode>(initialMode)
  
  const enterNormal = useCallback(() => setMode('normal'), [])
  const enterInsert = useCallback(() => setMode('insert'), [])
  const enterVisual = useCallback(() => setMode('visual'), [])
  
  return {
    mode,
    setMode,
    enterNormal,
    enterInsert,
    enterVisual,
    isNormal: mode === 'normal',
    isInsert: mode === 'insert',
    isVisual: mode === 'visual',
  }
}
```

#### Vim 模式键盘绑定

```tsx
// src/tui/hooks/useVimKeyBindings.ts
import { useKeyboard } from './useKeyboard'
import { VimMode } from './useVimMode'

export interface VimKeyBindings {
  normal?: Record<string, () => void>
  insert?: Record<string, () => void>
  visual?: Record<string, () => void>
}

/**
 * Vim 风格键盘绑定 Hook
 * 
 * @param mode - 当前 Vim 模式
 * @param bindings - 各模式的按键绑定
 * 
 * @example
 * ```tsx
 * useVimKeyBindings(mode, {
 *   normal: {
 *     h: () => moveLeft(),
 *     j: () => moveDown(),
 *     k: () => moveUp(),
 *     l: () => moveRight(),
 *   },
 *   insert: {
 *     // 插入模式下的特殊绑定
 *   },
 * })
 * ```
 */
export function useVimKeyBindings(
  mode: VimMode,
  bindings: VimKeyBindings
): void {
  const modeBindings = bindings[mode] || {}
  
  useKeyboard({
    ...modeBindings,
    // Escape 总是返回普通模式
    escape: () => {
      if (mode !== 'normal') {
        bindings.normal?.escape?.()
      }
    },
  })
}
```

#### DashboardScreen 集成 Vim 模式

```tsx
// 在 DashboardScreen 中集成
import { useVimMode } from '../hooks/useVimMode'
import { useVimKeyBindings } from '../hooks/useVimKeyBindings'

export const DashboardScreen = () => {
  const { mode, enterNormal, enterInsert, isNormal, isInsert } = useVimMode()
  
  // Vim 风格导航（普通模式）
  useVimKeyBindings(mode, {
    normal: {
      h: () => setSelectedService(prev => Math.max(0, prev - 1)),
      l: () => setSelectedService(prev => Math.min(serviceList.length - 1, prev + 1)),
      j: () => setSelectedService(prev => Math.min(serviceList.length - 1, prev + 4)),
      k: () => setSelectedService(prev => Math.max(0, prev - 4)),
      i: () => enterInsert(),
      r: () => restartService(),
      s: () => toggleService(),
      q: () => exit(),
    },
    insert: {
      // 插入模式下的命令输入
    },
  })
  
  // 普通模式: 键盘导航
  // 插入模式: 命令输入
  // ...
}
```

### 2.2 Day 3-4: 主题系统

#### ThemeContext 实现

```tsx
// src/tui/context/ThemeContext.tsx
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

/**
 * 主题定义
 */
export interface Theme {
  name: string
  colors: {
    primary: string
    secondary: string
    success: string
    warning: string
    error: string
    border: string
    text: string
    dimText: string
  }
}

/**
 * 内置主题
 */
export const THEMES = {
  dark: {
    name: 'dark',
    colors: {
      primary: 'cyan',
      secondary: 'gray',
      success: 'green',
      warning: 'yellow',
      error: 'red',
      border: 'gray',
      text: 'white',
      dimText: 'gray',
    },
  },
  light: {
    name: 'light',
    colors: {
      primary: 'blue',
      secondary: 'gray',
      success: 'green',
      warning: 'yellow',
      error: 'red',
      border: 'gray',
      text: 'black',
      dimText: 'gray',
    },
  },
  monokai: {
    name: 'monokai',
    colors: {
      primary: 'yellow',
      secondary: 'gray',
      success: 'green',
      warning: 'yellow',
      error: 'red',
      border: 'gray',
      text: 'white',
      dimText: 'gray',
    },
  },
} as const

/**
 * ThemeContext 值类型
 */
interface ThemeContextValue {
  /** 当前主题 */
  theme: Theme
  /** 设置主题 */
  setTheme: (name: string) => void
  /** 可用主题列表 */
  themes: string[]
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * ThemeProvider Props
 */
interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: string
}

/**
 * 主题 Provider
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme = 'dark',
}) => {
  const [theme, setThemeState] = useState<Theme>(
    THEMES[defaultTheme] || THEMES.dark
  )
  
  const setTheme = useCallback((name: string) => {
    const newTheme = THEMES[name as keyof typeof THEMES]
    if (newTheme) {
      setThemeState(newTheme)
    }
  }, [])
  
  const value: ThemeContextValue = {
    theme,
    setTheme,
    themes: Object.keys(THEMES),
  }
  
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * 获取当前主题
 */
export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
```

#### 主题切换组件

```tsx
// src/tui/components/ThemeSelector.tsx
import React from 'react'
import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import { useTheme } from '../context/ThemeContext'

/**
 * 主题选择器组件
 */
export const ThemeSelector: React.FC = () => {
  const { theme, setTheme, themes } = useTheme()
  
  const items = themes.map(name => ({
    label: name.charAt(0).toUpperCase() + name.slice(1),
    value: name,
  }))
  
  return (
    <Box flexDirection="column">
      <Text bold>Select Theme:</Text>
      <SelectInput
        items={items}
        onSelect={(item) => setTheme(item.value)}
        initialIndex={themes.indexOf(theme.name)}
      />
    </Box>
  )
}
```

### 2.3 Day 5-7: 多屏幕切换

#### 屏幕管理 Hook

```tsx
// src/tui/hooks/useScreen.ts
import { useState, useCallback } from 'react'

/**
 * 屏幕类型
 */
export type Screen = 'dashboard' | 'logs' | 'config' | 'help'

/**
 * useScreen 返回值
 */
export interface UseScreenResult {
  /** 当前屏幕 */
  currentScreen: Screen
  /** 切换屏幕 */
  switchScreen: (screen: Screen) => void
  /** 是否为 Dashboard */
  isDashboard: boolean
  /** 是否为 Logs */
  isLogs: boolean
  /** 是否为 Config */
  isConfig: boolean
  /** 是否为 Help */
  isHelp: boolean
}

/**
 * 屏幕管理 Hook
 */
export function useScreen(initialScreen: Screen = 'dashboard'): UseScreenResult {
  const [currentScreen, setCurrentScreen] = useState<Screen>(initialScreen)
  
  const switchScreen = useCallback((screen: Screen) => {
    setCurrentScreen(screen)
  }, [])
  
  return {
    currentScreen,
    switchScreen,
    isDashboard: currentScreen === 'dashboard',
    isLogs: currentScreen === 'logs',
    isConfig: currentScreen === 'config',
    isHelp: currentScreen === 'help',
  }
}
```

#### LogsScreen 实现

```tsx
// src/tui/screens/LogsScreen.tsx
import React, { useState, useMemo } from 'react'
import { Box, Text, useApp } from 'ink'
import { LogPanel } from '../components/LogPanel'
import { CommandInput } from '../components/CommandInput'
import { StatusBar } from '../components/StatusBar'
import { useLogStream } from '../hooks/useLogStream'
import { useKeyboard } from '../hooks/useKeyboard'
import { useTerminalSize } from '../hooks/useTerminalSize'
import { useLauncher } from '../context/LauncherContext'
import { ServiceName } from '../types'

/**
 * Logs 屏幕组件
 */
export const LogsScreen: React.FC = () => {
  const { exit } = useApp()
  const terminalSize = useTerminalSize()
  const { logManager, version } = useLauncher()
  
  const [filterService, setFilterService] = useState<ServiceName | undefined>()
  const { logs, clearLogs } = useLogStream(logManager, filterService ? [filterService] : undefined)
  
  // 键盘绑定
  useKeyboard({
    '1': () => setFilterService(ServiceName.LANGGRAPH),
    '2': () => setFilterService(ServiceName.GATEWAY),
    '3': () => setFilterService(ServiceName.FRONTEND),
    '4': () => setFilterService(ServiceName.NGINX),
    'a': () => setFilterService(undefined),
    'c': () => clearLogs(),
    'q': () => exit(),
    escape: () => setFilterService(undefined),
  })
  
  return (
    <Box flexDirection="column" height={terminalSize.height} padding={1}>
      {/* Header */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">Logs Viewer</Text>
        {filterService && (
          <Text dimColor> - Filtering: {filterService}</Text>
        )}
      </Box>
      
      {/* Help */}
      <Box marginBottom={1}>
        <Text dimColor>
          [1-4] Filter service | [a] All | [c] Clear | [Esc] Reset | [q] Quit
        </Text>
      </Box>
      
      {/* Log Panel */}
      <Box flexGrow={1} marginBottom={1}>
        <LogPanel
          logs={logs}
          height={terminalSize.height - 8}
          showService={!filterService}
        />
      </Box>
      
      {/* Status Bar */}
      <StatusBar
        version={version}
        services={{ total: 4, online: 0, offline: 0 }}
        help={`Logs: ${logs.length} entries`}
      />
    </Box>
  )
}
```

#### ConfigScreen 实现

```tsx
// src/tui/screens/ConfigScreen.tsx
import React, { useState, useEffect } from 'react'
import { Box, Text, useApp } from 'ink'
import { CommandInput } from '../components/CommandInput'
import { StatusBar } from '../components/StatusBar'
import { useKeyboard } from '../hooks/useKeyboard'
import { useTerminalSize } from '../hooks/useTerminalSize'
import { useLauncher } from '../context/LauncherContext'

/**
 * Config 屏幕组件
 */
export const ConfigScreen: React.FC = () => {
  const { exit } = useApp()
  const terminalSize = useTerminalSize()
  const { version } = useLauncher()
  
  const [config, setConfig] = useState<string>('')
  const [editing, setEditing] = useState(false)
  
  // 加载配置
  useEffect(() => {
    // TODO: 从文件加载配置
    setConfig('# Configuration file\n# Edit with care')
  }, [])
  
  // 键盘绑定
  useKeyboard({
    e: () => setEditing(true),
    q: () => exit(),
    escape: () => setEditing(false),
  })
  
  return (
    <Box flexDirection="column" height={terminalSize.height} padding={1}>
      {/* Header */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">Configuration Editor</Text>
      </Box>
      
      {/* Help */}
      <Box marginBottom={1}>
        <Text dimColor>[e] Edit | [s] Save | [Esc] Cancel | [q] Quit</Text>
      </Box>
      
      {/* Config Display */}
      <Box 
        flexGrow={1} 
        borderStyle="single" 
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Text>{config}</Text>
      </Box>
      
      {/* Status Bar */}
      <StatusBar
        version={version}
        services={{ total: 4, online: 0, offline: 0 }}
        help={editing ? 'Editing...' : 'Press [e] to edit'}
      />
    </Box>
  )
}
```

#### HelpScreen 实现

```tsx
// src/tui/screens/HelpScreen.tsx
import React from 'react'
import { Box, Text, useApp } from 'ink'
import { StatusBar } from '../components/StatusBar'
import { useKeyboard } from '../hooks/useKeyboard'
import { useTerminalSize } from '../hooks/useTerminalSize'
import { useLauncher } from '../context/LauncherContext'

/**
 * Help 屏幕组件
 */
export const HelpScreen: React.FC = () => {
  const { exit } = useApp()
  const terminalSize = useTerminalSize()
  const { version } = useLauncher()
  
  useKeyboard({
    q: () => exit(),
    escape: () => exit(),
  })
  
  return (
    <Box flexDirection="column" height={terminalSize.height} padding={1}>
      {/* Header */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">DeerFlow Launcher Help</Text>
      </Box>
      
      {/* Keyboard Shortcuts */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline>Keyboard Shortcuts</Text>
        <Box marginTop={1}>
          <Text>Navigation:</Text>
        </Box>
        <Box>
          <Text dimColor>  ← → ↑ ↓  </Text>
          <Text>Navigate services</Text>
        </Box>
        <Box>
          <Text dimColor>  h j k l  </Text>
          <Text>Vim-style navigation</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Actions:</Text>
        </Box>
        <Box>
          <Text dimColor>  r        </Text>
          <Text>Restart selected service</Text>
        </Box>
        <Box>
          <Text dimColor>  s        </Text>
          <Text>Start/Stop selected service</Text>
        </Box>
        <Box>
          <Text dimColor>  l        </Text>
          <Text>Switch to Logs screen</Text>
        </Box>
        <Box>
          <Text dimColor>  c        </Text>
          <Text>Switch to Config screen</Text>
        </Box>
        <Box>
          <Text dimColor>  ?        </Text>
          <Text>Show this help</Text>
        </Box>
        <Box>
          <Text dimColor>  q        </Text>
          <Text>Quit</Text>
        </Box>
      </Box>
      
      {/* Commands */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline>Commands</Text>
        <Box marginTop={1}>
          <Text dimColor>  start [service]   </Text>
          <Text>Start service(s)</Text>
        </Box>
        <Box>
          <Text dimColor>  stop [service]    </Text>
          <Text>Stop service(s)</Text>
        </Box>
        <Box>
          <Text dimColor>  restart [service] </Text>
          <Text>Restart service</Text>
        </Box>
        <Box>
          <Text dimColor>  status            </Text>
          <Text>Refresh status</Text>
        </Box>
        <Box>
          <Text dimColor>  logs              </Text>
          <Text>Switch to Logs screen</Text>
        </Box>
        <Box>
          <Text dimColor>  clear             </Text>
          <Text>Clear logs</Text>
        </Box>
        <Box>
          <Text dimColor>  exit / quit       </Text>
          <Text>Exit application</Text>
        </Box>
      </Box>
      
      {/* Status Bar */}
      <StatusBar
        version={version}
        services={{ total: 4, online: 0, offline: 0 }}
        help="Press any key to close"
      />
    </Box>
  )
}
```

#### 主屏幕路由

```tsx
// src/tui/screens/MainScreen.tsx
import React from 'react'
import { DashboardScreen } from './DashboardScreen'
import { LogsScreen } from './LogsScreen'
import { ConfigScreen } from './ConfigScreen'
import { HelpScreen } from './HelpScreen'
import { useScreen } from '../hooks/useScreen'
import { useKeyboard } from '../hooks/useKeyboard'

/**
 * 主屏幕路由组件
 */
export const MainScreen: React.FC = () => {
  const { currentScreen, switchScreen } = useScreen()
  
  // 全局屏幕切换
  useKeyboard({
    l: () => currentScreen === 'dashboard' && switchScreen('logs'),
    c: () => currentScreen === 'dashboard' && switchScreen('config'),
    '?': () => switchScreen('help'),
    escape: () => {
      if (currentScreen !== 'dashboard') {
        switchScreen('dashboard')
      }
    },
  })
  
  // 渲染当前屏幕
  switch (currentScreen) {
    case 'logs':
      return <LogsScreen />
    case 'config':
      return <ConfigScreen />
    case 'help':
      return <HelpScreen />
    default:
      return <DashboardScreen />
  }
}
```

---

## 三、Week 4: 完善与发布

### 3.1 Day 1-2: 帮助系统

#### HelpPanel 组件

```tsx
// src/tui/components/HelpPanel.tsx
import React from 'react'
import { Box, Text } from 'ink'

/**
 * HelpPanel Props
 */
export interface HelpPanelProps {
  /** 帮助内容 */
  content?: string
  /** 是否显示 */
  visible?: boolean
}

/**
 * 帮助面板组件
 */
export const HelpPanel: React.FC<HelpPanelProps> = ({
  content,
  visible = true,
}) => {
  if (!visible) return null
  
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginBottom={1}
    >
      <Text bold color="cyan">Help</Text>
      <Text>{content || 'Press [h] for help'}</Text>
    </Box>
  )
}
```

#### 上下文帮助系统

```tsx
// src/tui/hooks/useContextHelp.ts
import { useState, useCallback } from 'react'

type HelpContext = 'dashboard' | 'logs' | 'config' | 'command'

const HELP_CONTENT: Record<HelpContext, string> = {
  dashboard: `
Navigation: ← → ↑ ↓ | h j k l
Actions: [r] Restart | [s] Start/Stop
Screens: [l] Logs | [c] Config | [?] Help
Other: [q] Quit
  `.trim(),
  
  logs: `
Filter: [1-4] Service | [a] All
Actions: [c] Clear logs
Other: [Esc] Back | [q] Quit
  `.trim(),
  
  config: `
Actions: [e] Edit | [s] Save
Other: [Esc] Cancel | [q] Quit
  `.trim(),
  
  command: `
Commands: start, stop, restart, status, logs, clear, exit
Example: start langgraph
  `.trim(),
}

/**
 * 上下文帮助 Hook
 */
export function useContextHelp() {
  const [context, setContext] = useState<HelpContext>('dashboard')
  
  const getHelp = useCallback((ctx: HelpContext) => {
    return HELP_CONTENT[ctx]
  }, [])
  
  return {
    context,
    setContext,
    help: HELP_CONTENT[context],
    getHelp,
  }
}
```

### 3.2 Day 3-4: 配置持久化

#### 配置存储工具

```tsx
// src/tui/utils/configStorage.ts
import fs from 'fs'
import path from 'path'
import os from 'os'

const CONFIG_DIR = path.join(os.homedir(), '.deerflow')
const CONFIG_FILE = path.join(CONFIG_DIR, 'tui-config.json')

/**
 * TUI 配置接口
 */
export interface TUIConfig {
  /** 主题名称 */
  theme: string
  /** 默认屏幕 */
  defaultScreen: string
  /** 日志最大数量 */
  maxLogs: number
  /** 刷新间隔（毫秒） */
  refreshInterval: number
  /** Vim 模式默认开启 */
  vimMode: boolean
}

const DEFAULT_CONFIG: TUIConfig = {
  theme: 'dark',
  defaultScreen: 'dashboard',
  maxLogs: 1000,
  refreshInterval: 1000,
  vimMode: false,
}

/**
 * 加载配置
 */
export function loadConfig(): TUIConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const config = JSON.parse(content)
      return { ...DEFAULT_CONFIG, ...config }
    }
  } catch (error) {
    // 配置加载失败，使用默认配置
  }
  return DEFAULT_CONFIG
}

/**
 * 保存配置
 */
export function saveConfig(config: Partial<TUIConfig>): void {
  try {
    // 确保目录存在
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    
    // 读取现有配置
    const existing = loadConfig()
    const newConfig = { ...existing, ...config }
    
    // 写入配置
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2))
  } catch (error) {
    console.error('Failed to save config:', error)
  }
}

/**
 * 重置配置
 */
export function resetConfig(): void {
  saveConfig(DEFAULT_CONFIG)
}
```

#### 配置 Hook

```tsx
// src/tui/hooks/useConfig.ts
import { useState, useEffect, useCallback } from 'react'
import { loadConfig, saveConfig, TUIConfig } from '../utils/configStorage'

/**
 * 配置管理 Hook
 */
export function useConfig() {
  const [config, setConfigState] = useState<TUIConfig>(loadConfig)
  
  // 初始化时加载配置
  useEffect(() => {
    setConfigState(loadConfig())
  }, [])
  
  // 更新配置
  const setConfig = useCallback((updates: Partial<TUIConfig>) => {
    setConfigState(prev => {
      const newConfig = { ...prev, ...updates }
      saveConfig(newConfig)
      return newConfig
    })
  }, [])
  
  // 重置配置
  const resetConfig = useCallback(() => {
    const defaultConfig = loadConfig()
    setConfigState(defaultConfig)
    saveConfig(defaultConfig)
  }, [])
  
  return {
    config,
    setConfig,
    resetConfig,
  }
}
```

### 3.3 Day 5-7: 发布准备

#### 版本号更新

```json
// package.json
{
  "version": "0.5.0",
  "name": "deerflow-launcher"
}
```

#### CHANGELOG 更新

```markdown
# CHANGELOG

## [0.5.0] - 2026-04-16

### Added
- TUI Dashboard with React + Ink
- Real-time service status monitoring
- Real-time log streaming
- Keyboard navigation (arrow keys and Vim-style)
- Command input with history
- Multiple screens (Dashboard, Logs, Config, Help)
- Theme system (dark, light, monokai)
- Vim mode support
- Configuration persistence
- Auto-completion for commands

### Changed
- Enhanced CLI with `dashboard` command
- Improved error handling and display
- Optimized rendering performance

### Fixed
- Memory leak in log streaming
- Terminal resize handling
- Cross-platform compatibility issues
```

#### 发布脚本

```bash
#!/bin/bash
# scripts/release.sh

set -e

# 检查工作目录
if [[ $(git status --porcelain) ]]; then
  echo "Working directory not clean. Please commit changes first."
  exit 1
fi

# 运行测试
echo "Running tests..."
npm run test

# 构建
echo "Building..."
npm run build

# 打包
echo "Packaging binaries..."
npm run build:bin

# 检查产物
echo "Checking artifacts..."
ls -la dist/bin/

echo "Release preparation complete!"
echo "Artifacts are in dist/bin/"
```

---

## 四、验收标准

### 4.1 功能验收

```
□ Vim 模式
  ├── 模式切换正常
  ├── Vim 导航正常
  └── 状态显示正确

□ 主题系统
  ├── 主题切换正常
  ├── 颜色应用正确
  └── 持久化保存

□ 多屏幕切换
  ├── Logs 屏幕正常
  ├── Config 屏幕正常
  ├── Help 屏幕正常
  └── 切换流畅

□ 帮助系统
  ├── 上下文帮助正确
  ├── 快捷键提示完整
  └── 命令帮助完整

□ 配置持久化
  ├── 配置保存正常
  ├── 配置加载正常
  └── 重置功能正常
```

### 4.2 性能验收

```
□ 首次渲染 < 200ms
│  屏幕切换 < 100ms
│  主题切换 < 50ms
│  内存占用 < 50MB
│  CPU 占用 < 5%
│  无内存泄漏
```

### 4.3 发布验收

```
□ 版本号正确
│  CHANGELOG 完整
│  文档完善
│  测试覆盖率 > 80%
│  跨平台测试通过
│  打包产物正确
```

---

## 五、交付清单

### 5.1 文件清单

```
src/tui/
├── hooks/
│   ├── useVimMode.ts
│   ├── useVimKeyBindings.ts
│   ├── useScreen.ts
│   ├── useConfig.ts
│   └── useContextHelp.ts
├── context/
│   └── ThemeContext.tsx
├── screens/
│   ├── MainScreen.tsx
│   ├── LogsScreen.tsx
│   ├── ConfigScreen.tsx
│   └── HelpScreen.tsx
├── components/
│   ├── HelpPanel.tsx
│   └── ThemeSelector.tsx
└── utils/
    └── configStorage.ts
```

### 5.2 文档清单

```
□ README.md 更新
│  CHANGELOG.md
│  docs/TUI-GUIDE.md
│  docs/KEYBOARD-SHORTCUTS.md
│  docs/THEMES.md
└── docs/CONFIGURATION.md
```

---

*文档版本: v1.0*  
*最后更新: 2026-04-02*
