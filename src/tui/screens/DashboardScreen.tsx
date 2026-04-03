import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { StatusBar, ServiceGrid, LogPanel, CommandInput, InstanceSelector } from '../components/index.js';
import { useLauncher, useInstances } from '../context/LauncherContext.js';
import { useLogStream, useTerminalSize } from '../hooks/index.js';
import { Service, ServiceStatus, LogEntry, LogLevel, NavigationState } from '../types/index.js';
import { ServiceName } from '../../types/index.js';
import { ProcessStatus } from '../../modules/ProcessMonitor.js';
import { DEFAULT_SERVICES, SERVICE_PORTS, SERVICE_DESCRIPTIONS, THEME } from '../constants.js';
import { formatUptime } from '../utils/format.js';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const MIN_WIDTH_FOR_HORIZONTAL = 130;

async function getPM2Version(): Promise<string> {
  try {
    const { stdout } = await execAsync('pm2 --version');
    return stdout.trim();
  } catch {
    return 'N/A';
  }
}

interface DashboardScreenProps {
  onExit?: () => void;
}

type LayoutMode = 'horizontal' | 'vertical';

const SERVICE_NAMES: ServiceName[] = [ServiceName.LANGGRAPH, ServiceName.GATEWAY, ServiceName.FRONTEND, ServiceName.NGINX];

function mapProcessStatusToServiceStatus(status: ProcessStatus['status']): ServiceStatus {
  switch (status) {
    case 'online':
      return ServiceStatus.ONLINE;
    case 'offline':
    case 'stopped':
      return ServiceStatus.OFFLINE;
    case 'launching':
      return ServiceStatus.STARTING;
    case 'stopping':
      return ServiceStatus.STOPPING;
    case 'errored':
      return ServiceStatus.ERROR;
    default:
      return ServiceStatus.OFFLINE;
  }
}

function mapLogLevel(level: string): LogLevel {
  switch (level.toUpperCase()) {
    case 'DEBUG':
      return LogLevel.DEBUG;
    case 'INFO':
      return LogLevel.INFO;
    case 'WARN':
    case 'WARNING':
      return LogLevel.WARN;
    case 'ERROR':
      return LogLevel.ERROR;
    case 'SUCCESS':
      return LogLevel.SUCCESS;
    default:
      return LogLevel.INFO;
  }
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ onExit }) => {
  const { version, processManager, processMonitor, logManager } = useLauncher();
  const { instances, currentInstance, showInstanceSelector, setShowInstanceSelector, requestInstanceSwitch } = useInstances();
  const { exit } = useApp();
  const terminalSize = useTerminalSize();

  const [services, setServices] = useState<Service[]>(DEFAULT_SERVICES);
  const [loading, setLoading] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [pm2Version, setPM2Version] = useState<string>('...');

  const [nav, setNav] = useState<NavigationState>({
    mode: 'grid',
    selectedServiceIndex: 0,
    selectedLogTabIndex: 0,
    commandHistory: [],
    commandHistoryIndex: -1,
  });

  const logStreamResult = useLogStream({ maxLogs: 100 });

  const layoutMode: LayoutMode = useMemo(() => {
    return terminalSize.width >= MIN_WIDTH_FOR_HORIZONTAL ? 'horizontal' : 'vertical';
  }, [terminalSize.width]);

  useEffect(() => {
    getPM2Version().then(setPM2Version);
  }, []);

  useEffect(() => {
    let mounted = true;
    let interval: NodeJS.Timeout | null = null;

    const fetchStatus = async () => {
      try {
        const statuses = await processMonitor.getStatus();
        if (!mounted) return;

        const serviceInfos: Service[] = SERVICE_NAMES.map(name => {
          const status = statuses.find(s => s.name === name);
          if (status) {
            return {
              id: name,
              name: name.charAt(0).toUpperCase() + name.slice(1),
              port: SERVICE_PORTS[name] || 0,
              description: SERVICE_DESCRIPTIONS[name] || '',
              status: mapProcessStatusToServiceStatus(status.status),
              uptime: status.uptime > 0 ? formatUptime(status.uptime) : undefined,
              pid: status.pid,
              cpu: status.cpu,
              memory: status.memory,
            };
          }
          return {
            id: name,
            name: name.charAt(0).toUpperCase() + name.slice(1),
            port: SERVICE_PORTS[name] || 0,
            description: SERVICE_DESCRIPTIONS[name] || '',
            status: ServiceStatus.OFFLINE,
          };
        });

        setServices(serviceInfos);
        setLoading(false);
      } catch (error) {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchStatus();
    interval = setInterval(fetchStatus, 2000);

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, [processMonitor]);

  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    for (const serviceName of SERVICE_NAMES) {
      try {
        const unsubscribe = logManager.follow(serviceName, entry => {
          const logEntry: LogEntry = {
            id: `${Date.now()}-${Math.random()}`,
            serviceId: serviceName,
            timestamp: new Date(entry.timestamp),
            level: mapLogLevel(entry.level),
            message: entry.message,
          };
          logStreamResult.addLog(logEntry);
        });
        unsubscribers.push(unsubscribe);
      } catch (error) {
        // Ignore errors for log following
      }
    }

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [logManager, logStreamResult]);

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

  const handleServiceAction = useCallback(
    async (serviceId: string, action: 'start' | 'stop' | 'restart') => {
      try {
        const serviceName = SERVICE_NAMES.find(s => s === serviceId);
        if (!serviceName) return;

        const serviceDefs = await import('../../config/services.js').then(m =>
          m.getServiceDefinitions(process.cwd())
        );
        const definition = serviceDefs.find(d => d.name === serviceName);

        if (!definition) return;

        switch (action) {
          case 'start':
            await processManager.startService(definition, new Map());
            break;
          case 'stop':
            await processManager.stopService(serviceName);
            break;
          case 'restart':
            await processManager.stopService(serviceName);
            await new Promise(r => setTimeout(r, 1000));
            await processManager.startService(definition, new Map());
            break;
        }
      } catch (error) {
        // Handle error silently
      }
    },
    [processManager]
  );

  const handleExit = useCallback(async () => {
    if (isExiting) return;
    setIsExiting(true);

    if (onExit) {
      await onExit();
    }

    exit();
  }, [isExiting, onExit, exit]);

  const executeCLICommand = useCallback(async (cmd: string) => {
    return new Promise<void>((resolve) => {
      const fullCmd = cmd.trim();
      const parts = fullCmd.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      const args = parts.map(p => p.replace(/^"|"$/g, ''));
      
      const child = spawn('deerflow-launcher', args, {
        stdio: 'inherit',
        env: {
          ...process.env,
          DEERFLOW_PATH: process.env.DEERFLOW_PATH,
          INSTANCE_ID: process.env.INSTANCE_ID,
        },
      });

      child.on('close', () => {
        resolve();
      });

      child.on('error', () => {
        resolve();
      });
    });
  }, []);

  const handleCommand = useCallback(
    async (cmd: string) => {
      const trimmedCmd = cmd.trim();
      if (!trimmedCmd) {
        setNav(prev => ({ ...prev, mode: 'grid' }));
        return;
      }

      const parts = trimmedCmd.split(/\s+/);
      const command = parts[0]?.toLowerCase();
      const args = parts.slice(1);

      const builtInCommands = ['q', 'quit', 'exit', 'start', 'stop', 'restart', 'instance', 'inst', 'help', 'h', 'i'];
      
      if (builtInCommands.includes(command)) {
        switch (command) {
          case 'q':
          case 'quit':
          case 'exit':
            await handleExit();
            break;

          case 'start':
            if (args[0]) {
              const serviceName = SERVICE_NAMES.find(s => s === args[0]);
              if (serviceName) {
                await handleServiceAction(serviceName, 'start');
              }
            } else {
              for (const name of SERVICE_NAMES) {
                await handleServiceAction(name, 'start');
              }
            }
            break;

          case 'stop':
            if (args[0]) {
              const serviceName = SERVICE_NAMES.find(s => s === args[0]);
              if (serviceName) {
                await handleServiceAction(serviceName, 'stop');
              }
            } else {
              for (const name of SERVICE_NAMES) {
                await handleServiceAction(name, 'stop');
              }
            }
            break;

          case 'restart':
            if (args[0]) {
              const serviceName = SERVICE_NAMES.find(s => s === args[0]);
              if (serviceName) {
                await handleServiceAction(serviceName, 'restart');
              }
            } else {
              for (const name of SERVICE_NAMES) {
                await handleServiceAction(name, 'restart');
              }
            }
            break;

          case 'instance':
          case 'inst':
          case 'i':
            if (args[0]) {
              requestInstanceSwitch(args[0]);
            } else {
              setShowInstanceSelector(true);
            }
            break;

          case 'help':
          case 'h':
            break;
        }
      } else {
        await executeCLICommand(trimmedCmd);
      }

      setNav(prev => ({
        ...prev,
        mode: 'grid',
        commandHistory: [...prev.commandHistory, trimmedCmd],
      }));
    },
    [handleServiceAction, handleExit, requestInstanceSwitch, setShowInstanceSelector, executeCLICommand]
  );

  useInput((input, key) => {
    if (isExiting) return;

    if (showInstanceSelector) {
      if (key.escape) {
        setShowInstanceSelector(false);
      }
      return;
    }

    if (nav.mode === 'command') {
      if (key.escape) {
        setNav(prev => ({ ...prev, mode: 'grid' }));
      }
      return;
    }

    if (input === 'q') {
      handleExit();
    } else if (input === ':') {
      setNav(prev => ({ ...prev, mode: 'command' }));
    } else if (input === '/') {
      setNav(prev => ({
        ...prev,
        mode: prev.mode === 'grid' ? 'logs' : 'grid',
      }));
    } else if (input === 'i' && instances.length > 1) {
      setShowInstanceSelector(true);
    } else if (key.tab && !key.shift) {
      setNav(prev => ({
        ...prev,
        mode: prev.mode === 'grid' ? 'logs' : 'grid',
      }));
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" width="100%" height={terminalSize.height}>
        <StatusBar
          services={services}
          terminalSize={terminalSize}
          pm2Version={pm2Version}
          version={version}
          mode="grid"
          currentInstance={currentInstance}
          instanceCount={instances.length}
        />
        <Box flexGrow={1} alignItems="center" justifyContent="center">
          <Text dimColor>Loading service status...</Text>
        </Box>
      </Box>
    );
  }

  const renderMainContent = () => {
    if (layoutMode === 'horizontal') {
      const servicePanelWidth = Math.min(70, Math.floor(terminalSize.width * 0.4));
      const logHeight = Math.max(8, terminalSize.height - 12);

      return (
        <Box flexGrow={0} flexDirection="row" paddingX={1}>
          <Box
            width={servicePanelWidth}
            flexDirection="column"
            marginRight={1}
          >
            <ServiceGrid
              services={services}
              selectedIndex={nav.selectedServiceIndex}
              isFocused={nav.mode === 'grid'}
              onNavigate={handleServiceNavigate}
              onServiceAction={handleServiceAction}
            />
          </Box>

          <Box
            flexGrow={1}
            flexDirection="column"
            height={logHeight}
          >
            <LogPanel
              logs={logStreamResult.logs}
              activeTabIndex={nav.selectedLogTabIndex}
              levelFilter={levelFilter}
              isFocused={nav.mode === 'logs'}
              onTabChange={index => setNav(prev => ({ ...prev, selectedLogTabIndex: index }))}
              onLevelFilterChange={setLevelFilter}
              height={logHeight}
            />
          </Box>
        </Box>
      );
    } else {
      const statusBarHeight = 3;
      const commandInputHeight = 3;
      const serviceGridHeight = 11;
      const logHeight = Math.max(6, terminalSize.height - statusBarHeight - serviceGridHeight - commandInputHeight - 2);

      return (
        <Box flexDirection="column">
          <Box paddingX={1} height={serviceGridHeight}>
            <ServiceGrid
              services={services}
              selectedIndex={nav.selectedServiceIndex}
              isFocused={nav.mode === 'grid'}
              onNavigate={handleServiceNavigate}
              onServiceAction={handleServiceAction}
            />
          </Box>

          <Box paddingX={1} marginTop={1}>
            <LogPanel
              logs={logStreamResult.logs}
              activeTabIndex={nav.selectedLogTabIndex}
              levelFilter={levelFilter}
              isFocused={nav.mode === 'logs'}
              onTabChange={index => setNav(prev => ({ ...prev, selectedLogTabIndex: index }))}
              onLevelFilterChange={setLevelFilter}
              height={logHeight}
            />
          </Box>
        </Box>
      );
    }
  };

  return (
    <Box flexDirection="column" width="100%" height={terminalSize.height}>
      <StatusBar
        services={services}
        terminalSize={terminalSize}
        pm2Version={pm2Version}
        version={version}
        mode={nav.mode}
        currentInstance={currentInstance}
        instanceCount={instances.length}
      />

      {renderMainContent()}

      <Box paddingX={1}>
        <CommandInput
          onSubmit={handleCommand}
          history={nav.commandHistory}
          isActive={nav.mode === 'command'}
        />
      </Box>

      {showInstanceSelector && (
        <Box
          width="100%"
          flexDirection="column"
          alignItems="center"
        >
          <InstanceSelector
            instances={instances}
            currentInstance={currentInstance}
            onSelect={requestInstanceSwitch}
            onClose={() => setShowInstanceSelector(false)}
          />
        </Box>
      )}
    </Box>
  );
};
