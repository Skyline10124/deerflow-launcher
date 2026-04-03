import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { Service, ServiceStatus } from '../types/index.js';
import { STATUS_COLORS, THEME } from '../constants.js';
import { getStatusIcon } from '../utils/icons.js';
import { formatMemory } from '../utils/format.js';

interface ServiceCardProps {
  service: Service;
  isActive: boolean;
  isFocused: boolean;
  onSelect?: () => void;
  onStart?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
}

const STATUS_CONFIG = {
  [ServiceStatus.ONLINE]: {
    icon: '●',
    color: STATUS_COLORS[ServiceStatus.ONLINE],
    text: 'Running',
    showSpinner: false,
  },
  [ServiceStatus.OFFLINE]: {
    icon: '○',
    color: STATUS_COLORS[ServiceStatus.OFFLINE],
    text: 'Stopped',
    showSpinner: false,
  },
  [ServiceStatus.STARTING]: {
    icon: '◐',
    color: STATUS_COLORS[ServiceStatus.STARTING],
    text: 'Starting...',
    showSpinner: true,
  },
  [ServiceStatus.STOPPING]: {
    icon: '◑',
    color: STATUS_COLORS[ServiceStatus.STOPPING],
    text: 'Stopping...',
    showSpinner: true,
  },
  [ServiceStatus.ERROR]: {
    icon: '✗',
    color: STATUS_COLORS[ServiceStatus.ERROR],
    text: 'Error',
    showSpinner: false,
  },
} as const;

export const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  isActive,
  isFocused,
}) => {
  const config = STATUS_CONFIG[service.status];
  const borderColor = isActive ? THEME.colors.borderActive : THEME.colors.border;

  return (
    <Box
      flexDirection="column"
      borderStyle={isActive ? 'double' : 'round'}
      borderColor={borderColor}
      paddingX={2}
      paddingY={1}
      width="100%"
    >
      <Box justifyContent="space-between">
        <Box>
          <Text color={config.color}>
            {config.showSpinner ? (
              <Spinner type="dots" />
            ) : (
              config.icon
            )}
          </Text>
          <Text> </Text>
          <Text bold color={isActive ? THEME.colors.primary : THEME.colors.textPrimary}>
            {service.name}
          </Text>
        </Box>
        <Text color={THEME.colors.textMuted}>:{service.port}</Text>
      </Box>

      <Box>
        <Text color={THEME.colors.textSecondary}>{service.description}</Text>
      </Box>

      {service.status === ServiceStatus.ONLINE && (
        <Box>
          <Text color={THEME.colors.textMuted}>运行时长: </Text>
          <Text color={THEME.colors.textSecondary}>{service.uptime || '-'}</Text>
        </Box>
      )}

      {service.pid && (
        <Box gap={2}>
          <Box>
            <Text color={THEME.colors.textMuted}>PID: </Text>
            <Text color={THEME.colors.textSecondary}>{service.pid}</Text>
          </Box>
          {service.cpu !== undefined && (
            <Box>
              <Text color={THEME.colors.textMuted}>CPU: </Text>
              <Text color={THEME.colors.textSecondary}>{service.cpu}%</Text>
            </Box>
          )}
          {service.memory !== undefined && (
            <Box>
              <Text color={THEME.colors.textMuted}>Mem: </Text>
              <Text color={THEME.colors.textSecondary}>{formatMemory(service.memory)}</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
