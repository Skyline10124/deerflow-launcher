import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { THEME } from '../constants.js';

interface CommandInputProps {
  onSubmit: (command: string) => void;
  history: string[];
  isActive: boolean;
  placeholder?: string;
}

export const CommandInput: React.FC<CommandInputProps> = ({
  onSubmit,
  history,
  isActive,
  placeholder = 'Enter command...',
}) => {
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);

  useInput((value, key) => {
    if (!isActive) return;

    if (key.return) {
      if (input.trim()) {
        onSubmit(input.trim());
        setInput('');
        setHistoryIndex(-1);
      }
    } else if (key.upArrow) {
      const newIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(newIndex);
      setInput(history[history.length - 1 - newIndex] || '');
    } else if (key.downArrow) {
      const newIndex = Math.max(historyIndex - 1, -1);
      setHistoryIndex(newIndex);
      setInput(newIndex === -1 ? '' : history[history.length - 1 - newIndex]);
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (!key.ctrl && !key.meta && value) {
      setInput(prev => prev + value);
    }
  });

  return (
    <Box
      borderStyle="round"
      borderColor={isActive ? THEME.colors.borderActive : THEME.colors.border}
      paddingX={1}
      width="100%"
    >
      <Text color={THEME.colors.primary} bold>❯</Text>
      <Text> </Text>
      {input ? (
        <Text>{input}</Text>
      ) : (
        <Text color={THEME.colors.textMuted}>{placeholder}</Text>
      )}
      {isActive && <Text color={THEME.colors.primary}>▌</Text>}
      <Box flexGrow={1} />
      <Text color={THEME.colors.textMuted}>按 Enter 执行</Text>
    </Box>
  );
};
