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

interface DashboardScreenProps {
  onExit?: () => void;
}

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

  const [nav, setNav] = useState<NavigationState>({
    mode: 'grid',
    selectedServiceIndex: 0,
    selectedLogTabIndex: 0,
    commandHistory: [],
    commandHistoryIndex: -1,
  });

  const logStreamResult = useLogStream({ maxLogs: 100 });

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
            serviceId: entry.module,
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

  const handleCommand = useCallback(
    async (cmd: string) => {
      const parts = cmd.trim().split(/\s+/);
      const command = parts[0]?.toLowerCase();
      const args = parts.slice(1);

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
          }
          break;

        case 'stop':
          if (args[0]) {
            const serviceName = SERVICE_NAMES.find(s => s === args[0]);
            if (serviceName) {
              await handleServiceAction(serviceName, 'stop');
            }
          }
          break;

        case 'restart':
          if (args[0]) {
            const serviceName = SERVICE_NAMES.find(s => s === args[0]);
            if (serviceName) {
              await handleServiceAction(serviceName, 'restart');
            }
          }
          break;

        case 'instance':
        case 'inst':
          if (args[0]) {
            requestInstanceSwitch(args[0]);
          } else {
            setShowInstanceSelector(true);
          }
          break;

        case 'help':
          break;

        default:
          break;
      }

      setNav(prev => ({
        ...prev,
        mode: 'grid',
        commandHistory: [...prev.commandHistory, cmd],
      }));
    },
    [handleServiceAction, handleExit, requestInstanceSwitch, setShowInstanceSelector]
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

  const logPanelHeight = Math.max(5, Math.floor((terminalSize.height - 12) / 2));

  if (loading) {
    return (
      <Box flexDirection="column" width="100%" height={terminalSize.height}>
        <StatusBar
          services={services}
          terminalSize={terminalSize}
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

  return (
    <Box flexDirection="column" width="100%" height={terminalSize.height}>
      <StatusBar
        services={services}
        terminalSize={terminalSize}
        version={version}
        mode={nav.mode}
        currentInstance={currentInstance}
        instanceCount={instances.length}
      />

      <Box flexGrow={1} flexDirection="column" paddingTop={1} paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color={THEME.colors.textPrimary}>
            Services
          </Text>
        </Box>

        <ServiceGrid
          services={services}
          selectedIndex={nav.selectedServiceIndex}
          isFocused={nav.mode === 'grid'}
          onNavigate={handleServiceNavigate}
          onServiceAction={handleServiceAction}
        />
      </Box>

      <Box flexDirection="column" marginTop={1} paddingX={1}>
        <LogPanel
          logs={logStreamResult.logs}
          activeTabIndex={nav.selectedLogTabIndex}
          levelFilter={levelFilter}
          isFocused={nav.mode === 'logs'}
          onTabChange={index => setNav(prev => ({ ...prev, selectedLogTabIndex: index }))}
          onLevelFilterChange={setLevelFilter}
          height={logPanelHeight}
        />
      </Box>

      {nav.mode === 'command' && (
        <Box marginTop={1} paddingX={1}>
          <CommandInput
            onSubmit={handleCommand}
            history={nav.commandHistory}
            isActive={nav.mode === 'command'}
          />
        </Box>
      )}

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
