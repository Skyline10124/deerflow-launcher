import React from 'react'
import { Box, Text } from 'ink'

export interface StatusBarProps {
  version: string
  mode?: 'normal' | 'insert' | 'visual'
  services: {
    total: number
    online: number
    offline: number
  }
  help?: string
}

const MODE_CONFIG = {
  normal: 'NORMAL',
  insert: 'INSERT',
  visual: 'VISUAL',
} as const

export const StatusBar: React.FC<StatusBarProps> = ({
  version,
  mode = 'normal',
  services,
  help,
}) => {
  const modeText = MODE_CONFIG[mode]

  return (
    <Box justifyContent="space-between" width="100%">
      <Box>
        <Text inverse bold> DeerFlow Launcher v{version} </Text>
        <Text> </Text>
        <Text dimColor>
          Services:{' '}
          <Text color="green">{services.online}</Text>
          <Text>/{services.total}</Text>
        </Text>
      </Box>
      
      <Box>
        {help && <Text dimColor>{help}</Text>}
        <Text> </Text>
        <Text inverse bold> {modeText} </Text>
      </Box>
    </Box>
  )
}
