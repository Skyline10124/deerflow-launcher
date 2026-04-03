import React from 'react';
import { Box, Text } from 'ink';
import { Service, ServiceStatus } from '../types/index.js';
import { THEME } from '../constants.js';
import { ICONS } from '../utils/icons.js';
import { InstanceInfo } from '../context/LauncherContext.js';

interface StatusBarProps {
  services: Service[];
  terminalSize: { width: number; height: number };
  pm2Version?: string;
  version: string;
  mode: 'grid' | 'logs' | 'command';
  currentInstance?: InstanceInfo | null;
  instanceCount?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  services,
  terminalSize,
  pm2Version = 'v5.3.0',
  version,
  mode,
  currentInstance,
  instanceCount = 1,
}) => {
  const onlineCount = services.filter(s => s.status === ServiceStatus.ONLINE).length;

  return (
    <Box flexDirection="column" width="100%">
      <Box
        justifyContent="space-between"
        width="100%"
        paddingX={1}
      >
        <Box gap={2}>
          <Box>
            <Text color={THEME.colors.online}>●</Text>
            <Text color={THEME.colors.textSecondary}> {onlineCount}/{services.length} 运行中</Text>
          </Box>
          {currentInstance && (
            <Box>
              <Text color={THEME.colors.accent}>{ICONS.FOLDER}</Text>
              <Text color={THEME.colors.textSecondary}> {currentInstance.name}</Text>
              {instanceCount > 1 && (
                <Text color={THEME.colors.textMuted}> ({instanceCount} instances)</Text>
              )}
            </Box>
          )}
          <Box>
            <Text color={THEME.colors.textMuted}>{ICONS.TERMINAL} {terminalSize.width}×{terminalSize.height}</Text>
          </Box>
          <Box>
            <Text color={THEME.colors.textMuted}>{ICONS.PM2} PM2 {pm2Version}</Text>
          </Box>
        </Box>

        <Box flexGrow={1} />

        <Box gap={1}>
          {instanceCount > 1 && (
            <Box>
              <Text backgroundColor={THEME.colors.bgTertiary} color={THEME.colors.textSecondary}>
                {' '}i{' '}
              </Text>
              <Text color={THEME.colors.textMuted}>实例</Text>
            </Box>
          )}
          <Box>
            <Text backgroundColor={THEME.colors.bgTertiary} color={THEME.colors.textSecondary}>
              {' '}←→{' '}
            </Text>
            <Text color={THEME.colors.textMuted}>导航</Text>
          </Box>
          <Box>
            <Text backgroundColor={THEME.colors.bgTertiary} color={THEME.colors.textSecondary}>
              {' '}s{' '}
            </Text>
            <Text color={THEME.colors.textMuted}>启动/停止</Text>
          </Box>
          <Box>
            <Text backgroundColor={THEME.colors.bgTertiary} color={THEME.colors.textSecondary}>
              {' '}r{' '}
            </Text>
            <Text color={THEME.colors.textMuted}>重启</Text>
          </Box>
          <Box>
            <Text backgroundColor={THEME.colors.bgTertiary} color={THEME.colors.textSecondary}>
              {' '}q{' '}
            </Text>
            <Text color={THEME.colors.textMuted}>退出</Text>
          </Box>
        </Box>
      </Box>
      <Box width="100%">
        <Text color={THEME.colors.border}>{'─'.repeat(Math.max(10, terminalSize.width - 2))}</Text>
      </Box>
    </Box>
  );
};
