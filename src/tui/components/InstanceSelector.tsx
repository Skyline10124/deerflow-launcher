import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { THEME } from '../constants.js';
import { InstanceInfo } from '../context/LauncherContext.js';

interface InstanceSelectorProps {
  instances: InstanceInfo[];
  currentInstance: InstanceInfo | null;
  onSelect: (instanceName: string) => void;
  onClose: () => void;
}

export const InstanceSelector: React.FC<InstanceSelectorProps> = ({
  instances,
  currentInstance,
  onSelect,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (currentInstance) {
      const currentIndex = instances.findIndex(i => i.name === currentInstance.name);
      if (currentIndex >= 0) {
        setSelectedIndex(currentIndex);
      }
    }
  }, [currentInstance, instances]);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : instances.length - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(prev => (prev < instances.length - 1 ? prev + 1 : 0));
      return;
    }

    if (key.return) {
      const selected = instances[selectedIndex];
      if (selected) {
        onSelect(selected.name);
      }
      return;
    }
  });

  if (instances.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={THEME.colors.borderActive}
        paddingX={2}
        paddingY={1}
      >
        <Text color={THEME.colors.textMuted}>No instances configured</Text>
        <Text color={THEME.colors.textMuted}>Press ESC to close</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={THEME.colors.borderActive}
      paddingX={2}
      paddingY={1}
      width={60}
    >
      <Box marginBottom={1}>
        <Text bold color={THEME.colors.primary}>
          Select Instance
        </Text>
        <Text color={THEME.colors.textMuted}> (↑↓ to navigate, Enter to select, Esc to close)</Text>
      </Box>

      {instances.map((instance, index) => {
        const isSelected = index === selectedIndex;
        const isCurrent = instance.isCurrent;

        return (
          <Box key={instance.name} marginBottom={index < instances.length - 1 ? 0 : undefined}>
            <Box width={3}>
              {isSelected && (
                <Text color={THEME.colors.accent}>▶</Text>
              )}
            </Box>
            <Box width={2}>
              {isCurrent && (
                <Text color={THEME.colors.online}>●</Text>
              )}
            </Box>
            <Text
              bold={isSelected}
              color={isSelected ? THEME.colors.primary : THEME.colors.textPrimary}
            >
              {instance.name}
            </Text>
            {instance.description && (
              <Text color={THEME.colors.textMuted}> - {instance.description}</Text>
            )}
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text color={THEME.colors.textMuted}>
          {instances.length} instance{instances.length !== 1 ? 's' : ''} configured
        </Text>
      </Box>
    </Box>
  );
};
