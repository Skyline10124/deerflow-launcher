import React, { createContext, useContext, useMemo } from 'react'
import { Launcher } from '../../core/Launcher.js'
import { ProcessManager } from '../../modules/ProcessManager.js'
import { LogManager } from '../../modules/LogManager.js'
import { ProcessMonitor } from '../../modules/ProcessMonitor.js'

interface LauncherContextValue {
  launcher: Launcher
  processManager: ProcessManager
  logManager: LogManager
  processMonitor: ProcessMonitor
  version: string
}

const LauncherContext = createContext<LauncherContextValue | null>(null)

interface LauncherProviderProps {
  launcher: Launcher
  processManager: ProcessManager
  logManager: LogManager
  processMonitor: ProcessMonitor
  children: React.ReactNode
}

export const LauncherProvider: React.FC<LauncherProviderProps> = ({
  launcher,
  processManager,
  logManager,
  processMonitor,
  children,
}) => {
  const value = useMemo<LauncherContextValue>(() => ({
    launcher,
    processManager,
    logManager,
    processMonitor,
    version: '0.4.2-alpha',
  }), [launcher, processManager, logManager, processMonitor])

  return (
    <LauncherContext.Provider value={value}>
      {children}
    </LauncherContext.Provider>
  )
}

export const useLauncher = (): LauncherContextValue => {
  const context = useContext(LauncherContext)
  if (!context) {
    throw new Error('useLauncher must be used within LauncherProvider')
  }
  return context
}

export const useProcessManager = (): ProcessManager => {
  const { processManager } = useLauncher()
  return processManager
}

export const useLogManager = (): LogManager => {
  const { logManager } = useLauncher()
  return logManager
}

export const useProcessMonitor = (): ProcessMonitor => {
  const { processMonitor } = useLauncher()
  return processMonitor
}
