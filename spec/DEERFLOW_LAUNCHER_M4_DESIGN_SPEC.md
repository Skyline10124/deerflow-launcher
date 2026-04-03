# DeerFlow TUI Dashboard - Ink 实现规范

> 从界面设计到代码实现的完整技术规范

## 1. 架构概览

```
DashboardScreen
├── ServiceGrid
│   └── ServiceCard[]
├── LogPanel
│   ├── ServiceTabs
│   └── LogContent
├── CommandInput
└── StatusBar
```

## 2. 核心类型定义

```typescript
// types.ts

/** 服务状态枚举 */
export enum ServiceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  STARTING = 'starting',
  ERROR = 'error'
}

/** 日志级别枚举 */
export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SUCCESS = 'success'
}

/** 服务配置 */
export interface Service {
  id: string;              // 唯一标识: 'langgraph' | 'gateway' | 'frontend' | 'nginx'
  name: string;            // 显示名称
  port: number;            // 端口号
  description: string;     // 描述信息
  status: ServiceStatus;   // 当前状态
  uptime?: string;         // 运行时长
  pid?: number;            // 进程ID
}

/** 日志条目 */
export interface LogEntry {
  id: string;              // 唯一ID (uuid)
  serviceId: string;       // 关联服务ID
  timestamp: Date;         // 时间戳
  level: LogLevel;         // 日志级别
  message: string;         // 日志内容
  metadata?: Record<string, unknown>;
}

/** 主题色彩配置 */
export interface Theme {
  colors: {
    // 状态色
    online: string;        // '#3fb950'
    offline: string;       // '#6e7681'
    starting: string;      // '#d29922'
    error: string;         // '#f85149'
    
    // 主题色
    primary: string;       // '#58a6ff'
    accent: string;        // '#a371f7'
    info: string;          // '#56d4dd'
    
    // 背景色
    bgPrimary: string;     // '#0d1117'
    bgSecondary: string;   // '#161b22'
    bgTertiary: string;    // '#21262d'
    bgHover: string;       // '#1c2128'
    
    // 文字色
    textPrimary: string;   // '#e6edf3'
    textSecondary: string; // '#8b949e'
    textMuted: string;     // '#6e7681'
    
    // 边框
    border: string;        // '#30363d'
    borderActive: string;  // '#58a6ff'
  };
}

/** 键盘导航状态 */
export interface NavigationState {
  mode: 'grid' | 'logs' | 'command';  // 当前焦点区域
  selectedServiceIndex: number;        // 选中的服务索引
  selectedLogTabIndex: number;         // 选中的日志标签索引
  commandHistory: string[];            // 命令历史
  commandHistoryIndex: number;         // 当前历史位置
}

/** Dashboard 全局状态 */
export interface DashboardState {
  services: Service[];
  logs: LogEntry[];
  maxLogEntries: number;               // 默认 100
  isLoading: boolean;
  error: string | null;
  navigation: NavigationState;
}
```

## 3. 常量定义

```typescript
// constants.ts

export const STATUS_COLORS: Record<ServiceStatus, string> = {
  [ServiceStatus.ONLINE]: '#3fb950',
  [ServiceStatus.OFFLINE]: '#6e7681',
  [ServiceStatus.STARTING]: '#d29922',
  [ServiceStatus.ERROR]: '#f85149'
};

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.INFO]: '#56d4dd',
  [LogLevel.WARN]: '#d29922',
  [LogLevel.ERROR]: '#f85149',
  [LogLevel.SUCCESS]: '#3fb950'
};

export const SERVICE_PORTS: Record<string, number> = {
  langgraph: 2024,
  gateway: 8001,
  frontend: 3000,
  nginx: 2026
};

export const DEFAULT_SERVICES: Service[] = [
  {
    id: 'langgraph',
    name: 'LangGraph',
    port: 2024,
    description: 'AI Workflow Engine',
    status: ServiceStatus.ONLINE
  },
  {
    id: 'gateway',
    name: 'Gateway',
    port: 8001,
    description: 'FastAPI Proxy',
    status: ServiceStatus.ONLINE
  },
  {
    id: 'frontend',
    name: 'Frontend',
    port: 3000,
    description: 'React Dashboard',
    status: ServiceStatus.STARTING
  },
  {
    id: 'nginx',
    name: 'Nginx',
    port: 2026,
    description: 'Reverse Proxy',
    status: ServiceStatus.OFFLINE
  }
];

export const LOG_SERVICES = [
  { id: 'launcher', name: 'Launcher', color: '#a371f7' },
  { id: 'langgraph', name: 'LangGraph', color: '#3fb950' },
  { id: 'gateway', name: 'Gateway', color: '#58a6ff' },
  { id: 'frontend', name: 'Frontend', color: '#d29922' },
  { id: 'nginx', name: 'Nginx', color: '#f85149' }
];
```

## 4. 组件规范

### 4.1 ServiceCard 组件

```typescript
// components/ServiceCard.tsx
import { Box, Text } from 'ink';
import { Service, ServiceStatus } from '../types';
import { STATUS_COLORS } from '../constants';

interface ServiceCardProps {
  service: Service;
  isActive: boolean;           // 是否被选中
  isFocused: boolean;          // 是否聚焦
  onSelect?: () => void;
  onStart?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
}

/**
 * 服务状态卡片组件
 * 
 * 布局结构:
 * ┌─────────────────────────────┐
 * │ ● LangGraph        :2024    │  ← 头部: 状态点 + 名称 + 端口
 * │ AI Workflow Engine          │  ← 描述
 * │ 运行时长: 3d 12h 45m        │  ← 运行信息
 * └─────────────────────────────┘
 * 
 * 视觉规范:
 * - 边框: 1px solid #30363d
 * - 圆角: 6px
 * - 内边距: 16px
 * - 选中态: 边框变为 #58a6ff, 添加发光阴影
 * - 状态点: 8px 圆形, 带脉冲动画(仅 online/starting)
 */
export const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  isActive,
  isFocused,
  onSelect,
  onStart,
  onStop,
  onRestart
}) => {
  const statusColor = STATUS_COLORS[service.status];
  
  return (
    <Box
      borderStyle="round"
      borderColor={isActive ? '#58a6ff' : '#30363d'}
      padding={1}
      width="100%"
    >
      {/* 实现细节... */}
    </Box>
  );
};
```

**样式规则**:
```
borderStyle: isActive ? 'double' : 'round'
borderColor: isActive ? '#58a6ff' : '#30363d'
padding: { x: 2, y: 1 }
width: 100%

// 选中态发光效果(通过嵌套Box实现):
<Box>
  <Box borderStyle="round" borderColor="#58a6ff">
    {/* 内容 */}
  </Box>
</Box>
```

### 4.2 ServiceGrid 组件

```typescript
// components/ServiceGrid.tsx
import { Box, useInput } from 'ink';
import { ServiceCard } from './ServiceCard';
import { Service } from '../types';

interface ServiceGridProps {
  services: Service[];
  selectedIndex: number;
  onNavigate: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onServiceAction: (serviceId: string, action: 'start' | 'stop' | 'restart') => void;
}

/**
 * 服务网格布局组件
 * 
 * 布局: 2x2 网格
 * ┌─────────────┬─────────────┐
 * │ LangGraph   │ Gateway     │
 * ├─────────────┼─────────────┤
 * │ Frontend    │ Nginx       │
 * └─────────────┴─────────────┘
 * 
 * 键盘导航:
 * - ↑↓←→ : 在服务间移动
 * - 服务按索引排列: [0,1] 第一行, [2,3] 第二行
 */
export const ServiceGrid: React.FC<ServiceGridProps> = ({
  services,
  selectedIndex,
  onNavigate,
  onServiceAction
}) => {
  useInput((input, key) => {
    if (key.upArrow) onNavigate('up');
    if (key.downArrow) onNavigate('down');
    if (key.leftArrow) onNavigate('left');
    if (key.rightArrow) onNavigate('right');
    
    if (input === 's') {
      const service = services[selectedIndex];
      const action = service.status === 'online' ? 'stop' : 'start';
      onServiceAction(service.id, action);
    }
    if (input === 'r') {
      onServiceAction(services[selectedIndex].id, 'restart');
    }
  });
  
  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={1}>
        <ServiceCard service={services[0]} isActive={selectedIndex === 0} />
        <ServiceCard service={services[1]} isActive={selectedIndex === 1} />
      </Box>
      <Box gap={1}>
        <ServiceCard service={services[2]} isActive={selectedIndex === 2} />
        <ServiceCard service={services[3]} isActive={selectedIndex === 3} />
      </Box>
    </Box>
  );
};
```

### 4.3 LogPanel 组件

```typescript
// components/LogPanel.tsx
import { Box, Text, useInput } from 'ink';
import { LogEntry, LogLevel } from '../types';
import { LOG_SERVICES, LOG_LEVEL_COLORS } from '../constants';

interface LogPanelProps {
  logs: LogEntry[];
  activeTabIndex: number;
  levelFilter: LogLevel | 'all';
  onTabChange: (index: number) => void;
  onLevelFilterChange: (level: LogLevel | 'all') => void;
  maxEntries?: number;
}

/**
 * 日志面板组件(多服务标签版)
 * 
 * 布局结构:
 * ┌──────────────────────────────────────┐
 * │ 实时日志          [全部][信息][警告] │  ← 头部 + 级别过滤
 * ├──────────────────────────────────────┤
 * │ Launcher │ LangGraph │ Gateway │... │  ← 服务标签栏
 * ├──────────────────────────────────────┤
 * │ 10:42:18 INFO [Launcher] 启动序列... │  ← 日志内容区
 * │ 10:42:15 SUCC [LangGraph] 健康检查.. │
 * │ ...                                  │
 * └──────────────────────────────────────┘
 * 
 * 键盘交互:
 * - Tab / Shift+Tab : 切换日志标签
 * - 1-5 : 快速跳转到对应标签
 */
export const LogPanel: React.FC<LogPanelProps> = ({
  logs,
  activeTabIndex,
  levelFilter,
  onTabChange,
  onLevelFilterChange,
  maxEntries = 100
}) => {
  const activeServiceId = LOG_SERVICES[activeTabIndex].id;
  
  // 过滤日志
  const filteredLogs = logs
    .filter(log => activeServiceId === 'launcher' || log.serviceId === activeServiceId)
    .filter(log => levelFilter === 'all' || log.level === levelFilter)
    .slice(-maxEntries);
  
  useInput((input, key) => {
    // Tab 切换标签
    if (key.tab) {
      const nextIndex = key.shift 
        ? (activeTabIndex - 1 + LOG_SERVICES.length) % LOG_SERVICES.length
        : (activeTabIndex + 1) % LOG_SERVICES.length;
      onTabChange(nextIndex);
    }
    
    // 数字键快速跳转
    const num = parseInt(input);
    if (num >= 1 && num <= LOG_SERVICES.length) {
      onTabChange(num - 1);
    }
  });
  
  return (
    <Box 
      flexDirection="column" 
      borderStyle="round" 
      borderColor="#30363d"
      height="100%"
    >
      {/* 头部 */}
      <Box paddingX={1} paddingY={0} borderBottom>
        <Text>📋 实时日志</Text>
        <Box flexGrow={1} />
        {/* 级别过滤器 */}
        {['all', 'info', 'warn', 'error'].map(level => (
          <Text 
            key={level}
            backgroundColor={levelFilter === level ? '#58a6ff' : undefined}
            color={levelFilter === level ? '#0d1117' : '#8b949e'}
          >
            {level.toUpperCase()}
          </Text>
        ))}
      </Box>
      
      {/* 服务标签栏 */}
      <Box borderBottom>
        {LOG_SERVICES.map((svc, index) => (
          <Box 
            key={svc.id}
            paddingX={2}
            paddingY={0}
            borderStyle={activeTabIndex === index ? 'single' : undefined}
            borderBottom={activeTabIndex === index}
            borderBottomColor={activeTabIndex === index ? '#58a6ff' : undefined}
          >
            <Text color={svc.color}>●</Text>
            <Text> {svc.name}</Text>
          </Box>
        ))}
      </Box>
      
      {/* 日志内容 */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {filteredLogs.map(log => (
          <LogLine key={log.id} entry={log} />
        ))}
      </Box>
    </Box>
  );
};

// 单行日志组件
const LogLine: React.FC<{ entry: LogEntry }> = ({ entry }) => {
  const time = entry.timestamp.toLocaleTimeString('zh-CN', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  return (
    <Box>
      <Text color="#6e7681">{time}</Text>
      <Text> </Text>
      <Text color={LOG_LEVEL_COLORS[entry.level]} bold>
        {entry.level.toUpperCase().padStart(4)}
      </Text>
      <Text> </Text>
      <Text color="#8b949e">{entry.message}</Text>
    </Box>
  );
};
```

### 4.4 CommandInput 组件

```typescript
// components/CommandInput.tsx
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';

interface CommandInputProps {
  onSubmit: (command: string) => void;
  history: string[];
  isActive: boolean;
}

/**
 * 命令输入组件
 * 
 * 布局:
 * ❯ restart frontend      [按 Enter 执行]
 * 
 * 功能:
 * - 命令历史 (↑↓)
 * - Tab 自动补全
 * - 语法高亮
 */
export const CommandInput: React.FC<CommandInputProps> = ({
  onSubmit,
  history,
  isActive
}) => {
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  useInput((value, key) => {
    if (!isActive) return;
    
    if (key.return) {
      if (input.trim()) {
        onSubmit(input.trim());
        setInput('');
        setHistoryIndex(-1);
      }
    } else if (key.upArrow) {
      const newIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(newIndex);
      setInput(history[history.length - 1 - newIndex] || '');
    } else if (key.downArrow) {
      const newIndex = Math.max(historyIndex - 1, -1);
      setHistoryIndex(newIndex);
      setInput(newIndex === -1 ? '' : history[history.length - 1 - newIndex]);
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (!key.ctrl && !key.meta && value) {
      setInput(prev => prev + value);
    }
  });
  
  return (
    <Box borderStyle="round" borderColor={isActive ? '#58a6ff' : '#30363d'}>
      <Text color="#58a6ff" bold>❯</Text>
      <Text> </Text>
      <Text>{input}</Text>
      {isActive && <Text color="#58a6ff">▌</Text>}
      <Box flexGrow={1} />
      <Text color="#6e7681">按 Enter 执行</Text>
    </Box>
  );
};
```

### 4.5 StatusBar 组件

```typescript
// components/StatusBar.tsx
import { Box, Text } from 'ink';
import { Service, ServiceStatus } from '../types';

interface StatusBarProps {
  services: Service[];
  terminalSize: { rows: number; columns: number };
  pm2Version: string;
}

/**
 * 底部状态栏
 * 
 * 布局:
 * [● 2/4 运行中] [🖥️ 80×24] [⚡ PM2 v5.3.0]     [←→ 导航] [s 启动/停止] [r 重启] [q 退出]
 */
export const StatusBar: React.FC<StatusBarProps> = ({
  services,
  terminalSize,
  pm2Version
}) => {
  const onlineCount = services.filter(s => s.status === ServiceStatus.ONLINE).length;
  
  return (
    <Box borderTop paddingY={0}>
      {/* 左侧状态 */}
      <Box gap={2}>
        <Text color="#8b949e">
          <Text color="#3fb950">●</Text> {onlineCount}/{services.length} 运行中
        </Text>
        <Text color="#8b949e">🖥️ {terminalSize.columns}×{terminalSize.rows}</Text>
        <Text color="#8b949e">⚡ PM2 {pm2Version}</Text>
      </Box>
      
      <Box flexGrow={1} />
      
      {/* 右侧快捷键提示 */}
      <Box gap={2}>
        <Shortcut keys={['←', '→']} label="导航" />
        <Shortcut keys={['s']} label="启动/停止" />
        <Shortcut keys={['r']} label="重启" />
        <Shortcut keys={['q']} label="退出" />
      </Box>
    </Box>
  );
};

const Shortcut: React.FC<{ keys: string[]; label: string }> = ({ keys, label }) => (
  <Text color="#6e7681">
    {keys.map(k => (
      <Text key={k} backgroundColor="#21262d" color="#8b949e" paddingX={0.5}> {k} </Text>
    ))}
    <Text> {label}</Text>
  </Text>
);
```

## 5. 主屏幕组件

```typescript
// screens/DashboardScreen.tsx
import { Box, useApp, useInput } from 'ink';
import { useState, useEffect, useCallback } from 'react';
import { ServiceGrid } from '../components/ServiceGrid';
import { LogPanel } from '../components/LogPanel';
import { CommandInput } from '../components/CommandInput';
import { StatusBar } from '../components/StatusBar';
import { Service, LogEntry, ServiceStatus, LogLevel, NavigationState } from '../types';
import { DEFAULT_SERVICES, LOG_SERVICES } from '../constants';
import { useServiceStatus } from '../hooks/useServiceStatus';
import { useLogStream } from '../hooks/useLogStream';

/**
 * Dashboard 主屏幕
 * 
 * 布局:
 * ┌──────────────────────┬──────────────────────────┐
 * │                      │  [Launcher][LangGraph]...│
 * │   ServiceGrid        ├──────────────────────────┤
 * │   (2x2 服务卡片)      │                          │
 * │                      │      LogPanel            │
 * │                      │      (日志内容)           │
 * ├──────────────────────┴──────────────────────────┤
 * │  ❯ CommandInput                                  │
 * ├──────────────────────────────────────────────────┤
 * │  StatusBar                                       │
 * └──────────────────────────────────────────────────┘
 */
export const DashboardScreen: React.FC = () => {
  const { exit } = useApp();
  
  // 状态管理
  const [services, setServices] = useState<Service[]>(DEFAULT_SERVICES);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  
  const [nav, setNav] = useState<NavigationState>({
    mode: 'grid',
    selectedServiceIndex: 0,
    selectedLogTabIndex: 0,
    commandHistory: [],
    commandHistoryIndex: -1
  });
  
  // 自定义 Hooks
  const { status: serviceStatus, refresh: refreshServices } = useServiceStatus();
  const { logs: newLogs, clear: clearLogs } = useLogStream();
  
  // 全局键盘处理
  useInput((input, key) => {
    // 退出
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    }
    
    // 帮助
    if (input === 'h' || input === '?') {
      setNav(prev => ({ ...prev, mode: 'help' }));
    }
    
    // 切换焦点区域
    if (input === '/') {
      setNav(prev => ({ 
        ...prev, 
        mode: prev.mode === 'command' ? 'grid' : 'command' 
      }));
    }
    
    // Tab 在 grid 和 logs 间切换
    if (key.tab && !key.shift) {
      setNav(prev => ({ 
        ...prev, 
        mode: prev.mode === 'grid' ? 'logs' : 'grid' 
      }));
    }
  });
  
  // 服务导航
  const handleServiceNavigate = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    setNav(prev => {
      let newIndex = prev.selectedServiceIndex;
      const row = Math.floor(newIndex / 2);
      const col = newIndex % 2;
      
      switch (direction) {
        case 'up':
          if (row > 0) newIndex -= 2;
          break;
        case 'down':
          if (row < 1) newIndex += 2;
          break;
        case 'left':
          if (col > 0) newIndex -= 1;
          break;
        case 'right':
          if (col < 1) newIndex += 1;
          break;
      }
      
      return { ...prev, selectedServiceIndex: newIndex, mode: 'grid' };
    });
  }, []);
  
  // 服务操作
  const handleServiceAction = useCallback((serviceId: string, action: 'start' | 'stop' | 'restart') => {
    setServices(prev => prev.map(s => {
      if (s.id !== serviceId) return s;
      
      const statusMap: Record<string, ServiceStatus> = {
        start: ServiceStatus.STARTING,
        stop: ServiceStatus.OFFLINE,
        restart: ServiceStatus.STARTING
      };
      
      return { ...s, status: statusMap[action] };
    }));
    
    // 添加操作日志
    const log: LogEntry = {
      id: Date.now().toString(),
      serviceId: 'launcher',
      timestamp: new Date(),
      level: LogLevel.INFO,
      message: `[Launcher] 执行 ${action} 操作: ${serviceId}`
    };
    setLogs(prev => [...prev, log].slice(-100));
  }, []);
  
  // 命令处理
  const handleCommand = useCallback((command: string) => {
    setCommandHistory(prev => [...prev, command].slice(-50));
    
    const [cmd, ...args] = command.split(' ');
    
    switch (cmd) {
      case 'start':
      case 'stop':
      case 'restart':
        if (args[0]) {
          handleServiceAction(args[0], cmd);
        }
        break;
      case 'logs':
        setNav(prev => ({ ...prev, mode: 'logs' }));
        break;
      case 'clear':
        clearLogs();
        break;
      case 'exit':
      case 'quit':
        exit();
        break;
      default:
        // 未知命令提示
        setLogs(prev => [...prev, {
          id: Date.now().toString(),
          serviceId: 'launcher',
          timestamp: new Date(),
          level: LogLevel.WARN,
          message: `[Launcher] 未知命令: ${cmd}`
        }]);
    }
    
    setNav(prev => ({ ...prev, mode: 'grid' }));
  }, [exit, handleServiceAction, clearLogs]);
  
  // 同步日志流
  useEffect(() => {
    if (newLogs.length > 0) {
      setLogs(prev => [...prev, ...newLogs].slice(-100));
    }
  }, [newLogs]);
  
  return (
    <Box flexDirection="column" height="100%" padding={1}>
      {/* 主内容区 */}
      <Box flexGrow={1} gap={1}>
        {/* 左侧: 服务网格 */}
        <Box width="50%">
          <ServiceGrid
            services={services}
            selectedIndex={nav.selectedServiceIndex}
            onNavigate={handleServiceNavigate}
            onServiceAction={handleServiceAction}
          />
        </Box>
        
        {/* 右侧: 日志面板 */}
        <Box width="50%">
          <LogPanel
            logs={logs}
            activeTabIndex={nav.selectedLogTabIndex}
            levelFilter="all"
            onTabChange={index => setNav(prev => ({ 
              ...prev, 
              selectedLogTabIndex: index,
              mode: 'logs'
            }))}
            onLevelFilterChange={() => {}}
          />
        </Box>
      </Box>
      
      {/* 命令输入 */}
      <Box marginTop={1}>
        <CommandInput
          onSubmit={handleCommand}
          history={commandHistory}
          isActive={nav.mode === 'command'}
        />
      </Box>
      
      {/* 状态栏 */}
      <Box marginTop={1}>
        <StatusBar
          services={services}
          terminalSize={{ rows: 24, columns: 80 }}
          pm2Version="5.3.0"
        />
      </Box>
    </Box>
  );
};
```

## 6. 自定义 Hooks

```typescript
// hooks/useServiceStatus.ts
import { useState, useEffect, useCallback } from 'react';
import { Service, ServiceStatus } from '../types';

export const useServiceStatus = (pollInterval = 5000) => {
  const [status, setStatus] = useState<Map<string, ServiceStatus>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  
  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      // 调用 PM2 API 获取服务状态
      // const result = await pm2.list();
      // 模拟数据
      setStatus(new Map([
        ['langgraph', ServiceStatus.ONLINE],
        ['gateway', ServiceStatus.ONLINE],
        ['frontend', ServiceStatus.STARTING],
        ['nginx', ServiceStatus.OFFLINE]
      ]));
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(timer);
  }, [fetchStatus, pollInterval]);
  
  return { status, isLoading, refresh: fetchStatus };
};

// hooks/useLogStream.ts
import { useState, useEffect, useCallback } from 'react';
import { LogEntry, LogLevel } from '../types';

export const useLogStream = (maxEntries = 100) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // 模拟日志流 (实际项目中通过 WebSocket 或 EventSource 连接)
  useEffect(() => {
    const mockLogs = [
      { service: 'launcher', messages: ['启动序列执行', '配置加载完成'] },
      { service: 'langgraph', messages: ['API 请求处理', '工作流执行'] },
      { service: 'gateway', messages: ['代理请求', '响应返回'] }
    ];
    
    const interval = setInterval(() => {
      const source = mockLogs[Math.floor(Math.random() * mockLogs.length)];
      const message = source.messages[Math.floor(Math.random() * source.messages.length)];
      
      const entry: LogEntry = {
        id: Date.now().toString(),
        serviceId: source.service,
        timestamp: new Date(),
        level: Math.random() > 0.9 ? LogLevel.WARN : LogLevel.INFO,
        message: `[${source.service}] ${message}`
      };
      
      setLogs(prev => [...prev.slice(-maxEntries + 1), entry]);
    }, 2000);
    
    return () => clearInterval(interval);
  }, [maxEntries]);
  
  const clear = useCallback(() => setLogs([]), []);
  
  return { logs, clear };
};

// hooks/useTerminalSize.ts
import { useState, useEffect } from 'react';
import { stdout } from 'process';

export const useTerminalSize = () => {
  const [size, setSize] = useState({
    columns: stdout.columns || 80,
    rows: stdout.rows || 24
  });
  
  useEffect(() => {
    const handleResize = () => {
      setSize({
        columns: stdout.columns || 80,
        rows: stdout.rows || 24
      });
    };
    
    stdout.on('resize', handleResize);
    return () => stdout.off('resize', handleResize);
  }, []);
  
  return size;
};
```

## 7. 入口文件

```typescript
// index.tsx (CLI入口)
#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { DashboardScreen } from './screens/DashboardScreen';

const App = () => <DashboardScreen />;

render(<App />);
```

```typescript
// commands/dashboard.ts (Commander集成)
import { Command } from 'commander';
import { spawn } from 'child_process';
import path from 'path';

export const dashboardCommand = new Command('dashboard')
  .description('启动交互式 Dashboard TUI')
  .option('-p, --port <port>', 'Dashboard 服务端口', '2025')
  .action(async (options) => {
    // 使用 Ink 渲染 TUI
    const { render } = await import('ink');
    const { DashboardScreen } = await import('../screens/DashboardScreen');
    
    render(<DashboardScreen port={parseInt(options.port)} />);
  });
```

## 8. 依赖配置

```json
// package.json
{
  "dependencies": {
    "ink": "^4.4.1",
    "react": "^18.3.1",
    "commander": "^14.0.3",
    "pm2": "^6.0.14",
    "chalk": "^5.3.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "typescript": "^5.5.0",
    "tsx": "^4.15.0"
  }
}
```

## 9. 文件结构

```
src/
├── components/
│   ├── ServiceCard.tsx
│   ├── ServiceGrid.tsx
│   ├── LogPanel.tsx
│   ├── CommandInput.tsx
│   └── StatusBar.tsx
├── screens/
│   └── DashboardScreen.tsx
├── hooks/
│   ├── useServiceStatus.ts
│   ├── useLogStream.ts
│   └── useTerminalSize.ts
├── types.ts
├── constants.ts
└── index.tsx
```

---

**编码约定**:
- 使用函数组件 + Hooks
- Props 接口必须显式定义
- 颜色值统一从 constants 导入
- 键盘事件统一在 DashboardScreen 或各组件内处理
- 日志条目必须限制数量(默认100条)防止内存溢出