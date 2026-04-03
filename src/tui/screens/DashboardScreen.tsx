import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { StatusBar } from '../components/StatusBar.js'
import { ServiceGrid } from '../components/ServiceGrid.js'
import { LogPanel } from '../components/LogPanel.js'
import { CommandInput } from '../components/CommandInput.js'
import { useLauncher } from '../context/LauncherContext.js'
import { useLogStream, useTerminalSize } from '../hooks/index.js'
import { ServiceInfo, ServiceStatus, LogEntry, LogLevel } from '../types/index.js'
import { ServiceName } from '../../types/index.js'
import { ProcessStatus } from '../../modules/ProcessMonitor.js'

type DashboardMode = 'normal' | 'insert' | 'visual'

interface DashboardScreenProps {
  onExit?: () => void
}

const SERVICE_NAMES: ServiceName[] = [ServiceName.LANGGRAPH, ServiceName.GATEWAY, ServiceName.FRONTEND, ServiceName.NGINX]

function mapProcessStatusToServiceStatus(status: ProcessStatus['status']): ServiceStatus {
  switch (status) {
    case 'online':
      return ServiceStatus.ONLINE
    case 'offline':
    case 'stopped':
      return ServiceStatus.OFFLINE
    case 'launching':
      return ServiceStatus.STARTING
    case 'stopping':
      return ServiceStatus.STOPPING
    case 'errored':
      return ServiceStatus.ERROR
    default:
      return ServiceStatus.OFFLINE
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function getServicePort(name: ServiceName): number {
  const ports: Record<ServiceName, number> = {
    [ServiceName.LANGGRAPH]: 2024,
    [ServiceName.GATEWAY]: 8001,
    [ServiceName.FRONTEND]: 3000,
    [ServiceName.NGINX]: 2026,
  }
  return ports[name] || 0
}

function mapLogLevel(level: string): LogLevel {
  switch (level.toUpperCase()) {
    case 'DEBUG':
      return LogLevel.DEBUG
    case 'INFO':
      return LogLevel.INFO
    case 'WARN':
    case 'WARNING':
      return LogLevel.WARN
    case 'ERROR':
      return LogLevel.ERROR
    default:
      return LogLevel.INFO
  }
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ onExit }) => {
  const { version, processManager, processMonitor, logManager } = useLauncher()
  const { exit } = useApp()
  const { height } = useTerminalSize()
  
  const [mode, setMode] = useState<DashboardMode>('normal')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showCommandInput, setShowCommandInput] = useState(false)
  const [helpText, setHelpText] = useState('q:Quit | j/k:Nav | s:Start | x:Stop | r:Restart | :Command')
  
  const [services, setServices] = useState<ServiceInfo[]>([])
  const [loading, setLoading] = useState(true)
  
  const logStreamResult = useLogStream({
    maxLogs: 100,
  })
  
  useEffect(() => {
    let mounted = true
    let interval: NodeJS.Timeout | null = null
    
    const fetchStatus = async () => {
      try {
        const statuses = await processMonitor.getStatus()
        if (!mounted) return
        
        const serviceInfos: ServiceInfo[] = SERVICE_NAMES.map(name => {
          const status = statuses.find(s => s.name === name)
          if (status) {
            return {
              name: status.name,
              status: mapProcessStatusToServiceStatus(status.status),
              port: getServicePort(name),
              pid: status.pid,
              uptime: status.uptime > 0 ? formatUptime(status.uptime) : undefined,
              cpu: status.cpu,
              memory: status.memory,
            }
          }
          return {
            name: name,
            status: ServiceStatus.OFFLINE,
            port: getServicePort(name),
          }
        })
        
        setServices(serviceInfos)
        setLoading(false)
      } catch (error) {
        if (mounted) {
          setHelpText(`Error fetching status: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
    
    fetchStatus()
    interval = setInterval(fetchStatus, 2000)
    
    return () => {
      mounted = false
      if (interval) clearInterval(interval)
    }
  }, [processMonitor])
  
  useEffect(() => {
    const unsubscribers: (() => void)[] = []
    
    for (const serviceName of SERVICE_NAMES) {
      try {
        const unsubscribe = logManager.follow(serviceName, (entry) => {
          const logEntry: LogEntry = {
            timestamp: entry.timestamp,
            service: entry.module,
            level: mapLogLevel(entry.level),
            message: entry.message,
            raw: entry.raw,
          }
          logStreamResult.addLog(logEntry)
        })
        unsubscribers.push(unsubscribe)
      } catch (error) {
        // Ignore errors for log following
      }
    }
    
    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [logManager, logStreamResult])
  
  const serviceStats = useMemo(() => {
    const total = services.length
    const online = services.filter(s => s.status === ServiceStatus.ONLINE).length
    const offline = services.filter(s => s.status === ServiceStatus.OFFLINE).length
    return { total, online, offline }
  }, [services])
  
  const handleServiceSelect = useCallback((serviceName: ServiceName) => {
    setSelectedIndex(SERVICE_NAMES.indexOf(serviceName))
  }, [])
  
  const handleServiceAction = useCallback(async (action: 'start' | 'stop' | 'restart', serviceName: ServiceName) => {
    try {
      setHelpText(`${action} ${serviceName}...`)
      
      const serviceDefs = await import('../../config/services.js').then(m => m.getServiceDefinitions(process.cwd()))
      const definition = serviceDefs.find(d => d.name === serviceName)
      
      if (!definition) {
        setHelpText(`Service ${serviceName} not found`)
        return
      }
      
      switch (action) {
        case 'start':
          await processManager.startService(definition, new Map())
          break
        case 'stop':
          await processManager.stopService(serviceName)
          break
        case 'restart':
          await processManager.stopService(serviceName)
          await new Promise(r => setTimeout(r, 1000))
          await processManager.startService(definition, new Map())
          break
      }
      
      setHelpText(`${serviceName} ${action}ed`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setHelpText(`Error: ${errorMsg}`)
    }
  }, [processManager])
  
  const handleCommand = useCallback(async (cmd: string) => {
    const parts = cmd.trim().split(/\s+/)
    const command = parts[0]?.toLowerCase()
    const args = parts.slice(1)
    
    switch (command) {
      case 'q':
      case 'quit':
      case 'exit':
        if (onExit) {
          onExit()
        } else {
          exit()
        }
        break
        
      case 'start':
        if (args[0]) {
          const serviceName = SERVICE_NAMES.find(s => s === args[0])
          if (serviceName) {
            await handleServiceAction('start', serviceName)
          } else {
            setHelpText(`Unknown service: ${args[0]}`)
          }
        } else {
          setHelpText('Usage: start <service>')
        }
        break
        
      case 'stop':
        if (args[0]) {
          const serviceName = SERVICE_NAMES.find(s => s === args[0])
          if (serviceName) {
            await handleServiceAction('stop', serviceName)
          } else {
            setHelpText(`Unknown service: ${args[0]}`)
          }
        } else {
          setHelpText('Usage: stop <service>')
        }
        break
        
      case 'restart':
        if (args[0]) {
          const serviceName = SERVICE_NAMES.find(s => s === args[0])
          if (serviceName) {
            await handleServiceAction('restart', serviceName)
          } else {
            setHelpText(`Unknown service: ${args[0]}`)
          }
        } else {
          setHelpText('Usage: restart <service>')
        }
        break
        
      case 'h':
      case 'help':
        setHelpText('Commands: start|stop|restart <service> | q|quit|exit | help')
        break
        
      default:
        setHelpText(`Unknown command: ${command}`)
    }
    
    setShowCommandInput(false)
    setMode('normal')
  }, [handleServiceAction, onExit, exit])
  
  useInput((input, key) => {
    if (showCommandInput) {
      return
    }
    
    if (mode === 'normal') {
      if (input === 'q') {
        if (onExit) {
          onExit()
        } else {
          exit()
        }
      } else if (input === 'j' || key.downArrow) {
        setSelectedIndex(prev => Math.min(prev + 1, SERVICE_NAMES.length - 1))
      } else if (input === 'k' || key.upArrow) {
        setSelectedIndex(prev => Math.max(prev - 1, 0))
      } else if (input === ':') {
        setShowCommandInput(true)
        setMode('insert')
      } else if (key.return) {
        const serviceName = SERVICE_NAMES[selectedIndex]
        if (serviceName) {
          handleServiceSelect(serviceName)
        }
      } else if (input === 's') {
        const serviceName = SERVICE_NAMES[selectedIndex]
        if (serviceName) {
          handleServiceAction('start', serviceName)
        }
      } else if (input === 'x') {
        const serviceName = SERVICE_NAMES[selectedIndex]
        if (serviceName) {
          handleServiceAction('stop', serviceName)
        }
      } else if (input === 'r') {
        const serviceName = SERVICE_NAMES[selectedIndex]
        if (serviceName) {
          handleServiceAction('restart', serviceName)
        }
      } else if (input === 'v') {
        setMode('visual')
      }
    } else if (mode === 'visual') {
      if (input === 'q' || key.escape) {
        setMode('normal')
      } else if (input === 'j' || key.downArrow) {
        setSelectedIndex(prev => Math.min(prev + 1, SERVICE_NAMES.length - 1))
      } else if (input === 'k' || key.upArrow) {
        setSelectedIndex(prev => Math.max(prev - 1, 0))
      } else if (input === 's') {
        const serviceName = SERVICE_NAMES[selectedIndex]
        if (serviceName) {
          handleServiceAction('start', serviceName)
        }
        setMode('normal')
      } else if (input === 'x') {
        const serviceName = SERVICE_NAMES[selectedIndex]
        if (serviceName) {
          handleServiceAction('stop', serviceName)
        }
        setMode('normal')
      }
    }
  })
  
  const logPanelHeight = Math.max(5, Math.floor((height - 8) / 2))
  
  if (loading) {
    return (
      <Box flexDirection="column" width="100%" height={height}>
        <StatusBar
          version={version}
          mode={mode}
          services={{ total: 4, online: 0, offline: 4 }}
          help="Loading..."
        />
        <Box flexGrow={1} alignItems="center" justifyContent="center">
          <Text dimColor>Loading service status...</Text>
        </Box>
      </Box>
    )
  }
  
  return (
    <Box flexDirection="column" width="100%" height={height}>
      <StatusBar
        version={version}
        mode={mode}
        services={serviceStats}
        help={helpText}
      />
      
      <Box flexGrow={1} flexDirection="column" paddingTop={1}>
        <Box marginBottom={1}>
          <Text bold>Services</Text>
        </Box>
        
        <ServiceGrid
          services={services}
          selectedIndex={selectedIndex}
          columns={4}
        />
      </Box>
      
      <Box flexDirection="column" marginTop={1}>
        <Box marginBottom={1}>
          <Text bold>Logs</Text>
        </Box>
        
        <LogPanel
          logs={logStreamResult.logs}
          height={logPanelHeight}
          showService={true}
        />
      </Box>
      
      {showCommandInput && (
        <Box marginTop={1}>
          <CommandInput
            onSubmit={handleCommand}
            placeholder="Enter command..."
            prefix=":"
          />
        </Box>
      )}
    </Box>
  )
}
