import React, { useState, useCallback } from 'react'
import { Box, Text, useApp } from 'ink'
import { ServiceCard } from '../components/ServiceCard.js'
import { ServiceGrid } from '../components/ServiceGrid.js'
import { LogPanel } from '../components/LogPanel.js'
import { CommandInput } from '../components/CommandInput.js'
import { useServiceStatus, createMockServiceStatus } from '../hooks/useServiceStatus.js'
import { useLogStream, createMockLogEntry } from '../hooks/useLogStream.js'
import { useKeyboard } from '../hooks/useKeyboard.js'
import { ServiceStatus, LogLevel } from '../types/index.js'

const DemoDashboard: React.FC = () => {
  const { exit } = useApp()
  const [selectedIndex, setSelectedIndex] = useState(0)

  const { services, updateService } = useServiceStatus(
    async () => createMockServiceStatus(),
    { interval: 5000 }
  )

  const { logs, addLog } = useLogStream({ maxLogs: 100 })

  const handleCommand = useCallback((cmd: string) => {
    const [action, target] = cmd.split(' ')
    
    addLog(createMockLogEntry('launcher', LogLevel.INFO, `Command: ${cmd}`))

    switch (action) {
      case 'start':
        if (target) {
          updateService(target, { status: ServiceStatus.STARTING })
          setTimeout(() => {
            updateService(target, { status: ServiceStatus.ONLINE, pid: Math.floor(Math.random() * 10000) })
            addLog(createMockLogEntry(target, LogLevel.INFO, 'Service started'))
          }, 2000)
        }
        break
      case 'stop':
        if (target) {
          updateService(target, { status: ServiceStatus.STOPPING })
          setTimeout(() => {
            updateService(target, { status: ServiceStatus.OFFLINE, pid: undefined })
            addLog(createMockLogEntry(target, LogLevel.INFO, 'Service stopped'))
          }, 1000)
        }
        break
      case 'exit':
      case 'q':
        exit()
        break
      case 'help':
        addLog(createMockLogEntry('launcher', LogLevel.INFO, 'Commands: start/stop [service], exit, help'))
        break
      default:
        addLog(createMockLogEntry('launcher', LogLevel.WARN, `Unknown command: ${cmd}`))
    }
  }, [addLog, updateService, exit])

  useKeyboard({
    left: () => setSelectedIndex(i => Math.max(0, i - 1)),
    right: () => setSelectedIndex(i => Math.min(services.length - 1, i + 1)),
    r: () => {
      const service = services[selectedIndex]
      if (service) {
        handleCommand(`restart ${service.name}`)
      }
    },
    q: () => exit(),
    h: () => handleCommand('help'),
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">DeerFlow Launcher TUI Demo</Text>
        <Text dimColor> v0.4.2-alpha</Text>
      </Box>

      <Box marginBottom={1}>
        <ServiceGrid
          services={services.map((s: { name: string; status: ServiceStatus; port: number; pid?: number; cpu?: number; memory?: number }) => ({
            name: s.name,
            status: s.status,
            port: s.port,
            pid: s.pid,
            cpu: s.cpu,
            memory: s.memory,
          }))}
          selectedIndex={selectedIndex}
          columns={4}
        />
      </Box>

      <Box flexGrow={1} marginBottom={1}>
        <LogPanel logs={logs} height={8} />
      </Box>

      <CommandInput
        onSubmit={handleCommand}
        placeholder="start/stop [service] | exit | help"
      />

      <Box marginTop={1}>
        <Text dimColor>[←→] Navigate [r] Restart [q] Quit [h] Help</Text>
      </Box>
    </Box>
  )
}

export default DemoDashboard
