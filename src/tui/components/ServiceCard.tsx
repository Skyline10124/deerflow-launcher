import React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { ServiceStatus } from '../types/index.js'
import { STATUS_COLORS } from '../utils/colors.js'
import { STATUS_ICONS } from '../utils/icons.js'
import { formatMemory } from '../utils/format.js'

export interface ServiceCardProps {
  name: string
  status: ServiceStatus
  port: number
  pid?: number
  uptime?: string
  cpu?: number
  memory?: number
  selected?: boolean
}

const STATUS_CONFIG = {
  [ServiceStatus.ONLINE]: {
    icon: STATUS_ICONS.ONLINE,
    color: STATUS_COLORS.ONLINE,
    text: 'Running',
  },
  [ServiceStatus.OFFLINE]: {
    icon: STATUS_ICONS.OFFLINE,
    color: STATUS_COLORS.OFFLINE,
    text: 'Stopped',
  },
  [ServiceStatus.STARTING]: {
    icon: STATUS_ICONS.STARTING,
    color: STATUS_COLORS.STARTING,
    text: 'Starting...',
  },
  [ServiceStatus.STOPPING]: {
    icon: STATUS_ICONS.STOPPING,
    color: STATUS_COLORS.STOPPING,
    text: 'Stopping...',
  },
  [ServiceStatus.ERROR]: {
    icon: STATUS_ICONS.ERROR,
    color: STATUS_COLORS.ERROR,
    text: 'Error',
  },
} as const

export const ServiceCard: React.FC<ServiceCardProps> = ({
  name,
  status,
  port,
  pid,
  uptime,
  cpu,
  memory,
  selected = false,
}) => {
  const config = STATUS_CONFIG[status]
  const isTransitioning = status === ServiceStatus.STARTING || 
                          status === ServiceStatus.STOPPING

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={selected ? STATUS_COLORS.HIGHLIGHT : config.color}
      paddingX={1}
      width={20}
    >
      <Box>
        <Text bold color={selected ? STATUS_COLORS.HIGHLIGHT : 'white'}>
          {name}
        </Text>
      </Box>

      <Box>
        {isTransitioning ? (
          <>
            <Text color={config.color}>
              <Spinner type="dots" />
            </Text>
            <Text color={config.color}> {config.text}</Text>
          </>
        ) : (
          <Text color={config.color}>
            {config.icon} {config.text}
          </Text>
        )}
      </Box>

      <Box>
        <Text dimColor>Port: </Text>
        <Text>{port}</Text>
      </Box>

      {pid && (
        <Box>
          <Text dimColor>PID: </Text>
          <Text>{pid}</Text>
        </Box>
      )}

      {uptime && status === ServiceStatus.ONLINE && (
        <Box>
          <Text dimColor>Uptime: </Text>
          <Text>{uptime}</Text>
        </Box>
      )}

      {status === ServiceStatus.ONLINE && (cpu !== undefined || memory !== undefined) && (
        <Box>
          <Text dimColor>
            {cpu !== undefined && `CPU: ${cpu}%`}
            {cpu !== undefined && memory !== undefined && ' | '}
            {memory !== undefined && `Mem: ${formatMemory(memory)}`}
          </Text>
        </Box>
      )}
    </Box>
  )
}
