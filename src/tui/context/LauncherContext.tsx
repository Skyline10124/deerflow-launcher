import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { Launcher } from '../../core/Launcher.js';
import { ProcessManager } from '../../modules/ProcessManager.js';
import { LogManager } from '../../modules/LogManager.js';
import { ProcessMonitor } from '../../modules/ProcessMonitor.js';
import { getDeerflowPaths } from '../../modules/LauncherConfig.js';

export interface InstanceInfo {
  name: string;
  path: string;
  description?: string;
  isCurrent: boolean;
}

interface LauncherContextValue {
  launcher: Launcher;
  processManager: ProcessManager;
  logManager: LogManager;
  processMonitor: ProcessMonitor;
  version: string;
  instanceId: string;
}

interface InstanceContextValue {
  instances: InstanceInfo[];
  currentInstance: InstanceInfo | null;
  showInstanceSelector: boolean;
  setShowInstanceSelector: (show: boolean) => void;
  requestInstanceSwitch: (instanceName: string) => void;
}

const LauncherContext = createContext<LauncherContextValue | null>(null);
const InstanceContext = createContext<InstanceContextValue | null>(null);

interface LauncherProviderProps {
  launcher: Launcher;
  processManager: ProcessManager;
  logManager: LogManager;
  processMonitor: ProcessMonitor;
  instanceId: string;
  version?: string;
  onInstanceSwitch?: (instanceName: string) => void;
  children: React.ReactNode;
}

export const LauncherProvider: React.FC<LauncherProviderProps> = ({
  launcher,
  processManager,
  logManager,
  processMonitor,
  instanceId,
  version = '0.4.4-alpha',
  onInstanceSwitch,
  children,
}) => {
  const [showInstanceSelector, setShowInstanceSelector] = useState(false);

  const launcherValue = useMemo<LauncherContextValue>(() => ({
    launcher,
    processManager,
    logManager,
    processMonitor,
    version,
    instanceId,
  }), [launcher, processManager, logManager, processMonitor, version, instanceId]);

  const instances = useMemo<InstanceInfo[]>(() => {
    const paths = getDeerflowPaths();
    if (paths.length === 0) {
      return [{
        name: instanceId,
        path: process.cwd(),
        isCurrent: true,
      }];
    }
    return paths.map(p => ({
      name: p.name,
      path: p.path,
      description: p.description,
      isCurrent: p.name === instanceId,
    }));
  }, [instanceId]);

  const currentInstance = useMemo<InstanceInfo | null>(() => {
    return instances.find(i => i.isCurrent) || instances[0] || null;
  }, [instances]);

  const requestInstanceSwitch = useCallback((instanceName: string) => {
    if (instanceName !== instanceId && onInstanceSwitch) {
      onInstanceSwitch(instanceName);
    }
    setShowInstanceSelector(false);
  }, [instanceId, onInstanceSwitch]);

  const instanceValue = useMemo<InstanceContextValue>(() => ({
    instances,
    currentInstance,
    showInstanceSelector,
    setShowInstanceSelector,
    requestInstanceSwitch,
  }), [instances, currentInstance, showInstanceSelector, requestInstanceSwitch]);

  return (
    <LauncherContext.Provider value={launcherValue}>
      <InstanceContext.Provider value={instanceValue}>
        {children}
      </InstanceContext.Provider>
    </LauncherContext.Provider>
  );
};

export const useLauncher = (): LauncherContextValue => {
  const context = useContext(LauncherContext);
  if (!context) {
    throw new Error('useLauncher must be used within LauncherProvider');
  }
  return context;
};

export const useProcessManager = (): ProcessManager => {
  const { processManager } = useLauncher();
  return processManager;
};

export const useLogManager = (): LogManager => {
  const { logManager } = useLauncher();
  return logManager;
};

export const useProcessMonitor = (): ProcessMonitor => {
  const { processMonitor } = useLauncher();
  return processMonitor;
};

export const useInstances = () => {
  const context = useContext(InstanceContext);
  if (!context) {
    throw new Error('useInstances must be used within LauncherProvider');
  }
  return context;
};
