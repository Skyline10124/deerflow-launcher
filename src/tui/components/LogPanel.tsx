import React, { useMemo } from 'react'
import { Box, Text } from 'ink'
import { LogEntry, LogLevel } from '../types'
import { STATUS_COLORS } from '../utils/colors'

export interface LogPanelProps {
  logs: LogEntry[]
  height?: number
  showService?: boolean
  filter?: {
    service?: string
    level?: LogLevel[]
  }
}

const LEVEL_CONFIG = {
  [LogLevel.DEBUG]: { color: STATUS_COLORS.DEBUG, label: 'DEBUG' },
  [LogLevel.INFO]: { color: STATUS_COLORS.INFO, label: 'INFO ' },
  [LogLevel.WARN]: { color: STATUS_COLORS.WARN, label: 'WARN ' },
  [LogLevel.ERROR]: { color: STATUS_COLORS.ERROR_LOG, label: 'ERROR' },
} as const

export const LogPanel: React.FC<LogPanelProps> = ({
  logs,
  height = 10,
  showService = true,
  filter,
}) => {
  const filteredLogs = useMemo(() => {
    let result = logs
    if (filter?.service) {
      result = result.filter(log => log.service === filter.service)
    }
    if (filter?.level) {
      result = result.filter(log => filter.level!.includes(log.level))
    }
    return result
  }, [logs, filter])

  const visibleLogs = filteredLogs.slice(-height)

  return (
    <Box 
      flexDirection="column" 
      borderStyle="single" 
      borderColor={STATUS_COLORS.BORDER} 
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold inverse> Logs </Text>
        {filter?.service && (
          <Text dimColor> [{filter.service}]</Text>
        )}
      </Box>
      
      {visibleLogs.length === 0 ? (
        <Text dimColor>No logs to display</Text>
      ) : (
        visibleLogs.map((log, index) => {
          const levelConfig = LEVEL_CONFIG[log.level]
          return (
            <Box key={index}>
              <Text dimColor>[{log.timestamp}]</Text>
              {showService && (
                <Text color="cyan">[{log.service}]</Text>
              )}
              <Text color={levelConfig.color}> {levelConfig.label} </Text>
              <Text>{log.message}</Text>
            </Box>
          )
        })
      )}
    </Box>
  )
}
