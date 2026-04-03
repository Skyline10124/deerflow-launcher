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
    <Box
      justifyContent="space-between"
      width="100%"
      borderStyle="single"
      borderColor={THEME.colors.border}
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

      <Box gap={2}>
        {instanceCount > 1 && <Shortcut keys={['i']} label="切换实例" />}
        <Shortcut keys={['←', '→']} label="导航" />
        <Shortcut keys={['s']} label="启动/停止" />
        <Shortcut keys={['r']} label="重启" />
        <Shortcut keys={['q']} label="退出" />
      </Box>
    </Box>
  );
};

const Shortcut: React.FC<{ keys: string[]; label: string }> = ({ keys, label }) => (
  <Box>
    {keys.map((k, i) => (
      <Box key={i}>
        <Text backgroundColor={THEME.colors.bgTertiary} color={THEME.colors.textSecondary}>
          {' '}{k}{' '}
        </Text>
        {i < keys.length - 1 && <Text> </Text>}
      </Box>
    ))}
    <Text color={THEME.colors.textMuted}> {label}</Text>
  </Box>
);
