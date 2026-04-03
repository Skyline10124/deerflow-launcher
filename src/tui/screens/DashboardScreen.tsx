import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { StatusBar } from '../components/StatusBar.js'
import { ServiceGrid } from '../components/ServiceGrid.js'
import { LogPanel } from '../components/LogPanel.js'
import { CommandInput } from '../components/CommandInput.js'
import { useLauncher } from '../context/LauncherContext.js'
import { useServiceStatus, useLogStream, useTerminalSize } from '../hooks/index.js'
import { ServiceInfo, ServiceStatus, LogEntry, ServiceName } from '../types/index.js'
import { createMockServiceStatus, createMockLogEntry } from '../hooks/index.js'
import { LogLevel } from '../types/index.js'

type DashboardMode = 'normal' | 'insert' | 'visual'

interface DashboardScreenProps {
  onExit?: () => void
}

const SERVICE_NAMES: ServiceName[] = ['langgraph', 'gateway', 'frontend', 'nginx']

const fetchMockStatus = async (): Promise<ServiceInfo[]> => {
  return createMockServiceStatus()
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ onExit }) => {
  const { version, processManager, processMonitor } = useLauncher()
  const { exit } = useApp()
  const { height } = useTerminalSize()
  
  const [mode, setMode] = useState<DashboardMode>('normal')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedServices, setSelectedServices] = useState<Set<ServiceName>>(new Set())
  const [showCommandInput, setShowCommandInput] = useState(false)
  const [helpText, setHelpText] = useState('q:Quit | j/k:Nav | Enter:Select | :Command')
  
  const serviceStatusResult = useServiceStatus(fetchMockStatus, {
    interval: 2000,
  })
  
  const logStreamResult = useLogStream({
    maxLogs: 100,
  })
  
  useEffect(() => {
    const interval = setInterval(() => {
      const services = ['langgraph', 'gateway', 'frontend', 'nginx'] as const
      const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR] as const
      const messages = [
        'Request processed successfully',
        'Connection established',
        'Cache miss for key',
        'Processing batch request',
        'Health check passed',
      ]
      
      const service = services[Math.floor(Math.random() * services.length)]
      const level = levels[Math.floor(Math.random() * levels.length)]
      const message = messages[Math.floor(Math.random() * messages.length)]
      
      logStreamResult.addLog(createMockLogEntry(service, level, message))
    }, 500)
    
    return () => clearInterval(interval)
  }, [logStreamResult])
  
  const serviceStats = useMemo(() => {
    const total = serviceStatusResult.services.length
    const online = serviceStatusResult.services.filter(s => s.status === ServiceStatus.ONLINE).length
    const offline = serviceStatusResult.services.filter(s => s.status === ServiceStatus.OFFLINE).length
    return { total, online, offline }
  }, [serviceStatusResult.services])
  
  const handleServiceSelect = useCallback((serviceName: ServiceName) => {
    setSelectedIndex(SERVICE_NAMES.indexOf(serviceName))
  }, [])
  
  const handleServiceAction = useCallback(async (action: 'start' | 'stop' | 'restart', serviceName: ServiceName) => {
    try {
      setHelpText(`${action} ${serviceName}...`)
      await new Promise(resolve => setTimeout(resolve, 500))
      setHelpText(`${serviceName} ${action}ed`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setHelpText(`Error: ${errorMsg}`)
    }
  }, [])
  
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
          await handleServiceAction('start', args[0] as ServiceName)
        }
        break
        
      case 'stop':
        if (args[0]) {
          await handleServiceAction('stop', args[0] as ServiceName)
        }
        break
        
      case 'restart':
        if (args[0]) {
          await handleServiceAction('restart', args[0] as ServiceName)
        }
        break
        
      case 'h':
      case 'help':
        setHelpText('Commands: start|stop|restart <service> | q|quit|exit')
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
        setSelectedServices(new Set())
      }
    } else if (mode === 'visual') {
      if (input === 'q' || key.escape) {
        setMode('normal')
        setSelectedServices(new Set())
      } else if (input === 'j' || key.downArrow) {
        setSelectedIndex(prev => Math.min(prev + 1, SERVICE_NAMES.length - 1))
      } else if (input === 'k' || key.upArrow) {
        setSelectedIndex(prev => Math.max(prev - 1, 0))
      } else if (key.return || input === ' ') {
        const serviceName = SERVICE_NAMES[selectedIndex]
        if (serviceName) {
          setSelectedServices(prev => {
            const next = new Set(prev)
            if (next.has(serviceName)) {
              next.delete(serviceName)
            } else {
              next.add(serviceName)
            }
            return next
          })
        }
      } else if (input === 's') {
        selectedServices.forEach(name => handleServiceAction('start', name))
        setMode('normal')
        setSelectedServices(new Set())
      } else if (input === 'x') {
        selectedServices.forEach(name => handleServiceAction('stop', name))
        setMode('normal')
        setSelectedServices(new Set())
      }
    }
  })
  
  const logPanelHeight = Math.max(5, Math.floor((height - 8) / 2))
  
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
          services={serviceStatusResult.services}
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
