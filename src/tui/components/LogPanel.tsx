import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { LogEntry, LogLevel, LogService } from '../types/index.js';
import { LOG_SERVICES, LOG_LEVEL_COLORS, THEME } from '../constants.js';
import { formatTimestamp, formatLogLevel } from '../utils/format.js';

interface LogPanelProps {
  logs: LogEntry[];
  activeTabIndex: number;
  levelFilter: LogLevel | 'all';
  isFocused: boolean;
  onTabChange: (index: number) => void;
  onLevelFilterChange: (level: LogLevel | 'all') => void;
  height?: number;
  maxEntries?: number;
}

const LEVEL_FILTERS: Array<LogLevel | 'all'> = ['all', LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];

export const LogPanel: React.FC<LogPanelProps> = ({
  logs,
  activeTabIndex,
  levelFilter,
  isFocused,
  onTabChange,
  onLevelFilterChange,
  height = 10,
  maxEntries = 100,
}) => {
  const activeService = LOG_SERVICES[activeTabIndex];

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (activeService && activeService.id !== 'launcher') {
      result = result.filter(log => log.serviceId === activeService.id);
    }
    if (levelFilter !== 'all') {
      result = result.filter(log => log.level === levelFilter);
    }
    return result.slice(-maxEntries);
  }, [logs, activeService, levelFilter, maxEntries]);

  const visibleLogs = filteredLogs.slice(-height);

  useInput((input, key) => {
    if (!isFocused) return;

    if (key.tab) {
      const nextIndex = key.shift
        ? (activeTabIndex - 1 + LOG_SERVICES.length) % LOG_SERVICES.length
        : (activeTabIndex + 1) % LOG_SERVICES.length;
      onTabChange(nextIndex);
    }

    const num = parseInt(input);
    if (num >= 1 && num <= LOG_SERVICES.length) {
      onTabChange(num - 1);
    }

    if (input === 'f') {
      const currentIndex = LEVEL_FILTERS.indexOf(levelFilter);
      const nextIndex = (currentIndex + 1) % LEVEL_FILTERS.length;
      onLevelFilterChange(LEVEL_FILTERS[nextIndex]);
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={THEME.colors.border}
      height="100%"
    >
      <Box paddingX={1} justifyContent="space-between">
        <Box>
          <Text>📋 实时日志</Text>
        </Box>
        <Box gap={1}>
          {LEVEL_FILTERS.map(level => (
            <Text
              key={level}
              color={levelFilter === level ? THEME.colors.primary : THEME.colors.textMuted}
              bold={levelFilter === level}
            >
              [{level.toUpperCase()}]
            </Text>
          ))}
        </Box>
      </Box>

      <Box borderBottom borderColor={THEME.colors.border}>
        {LOG_SERVICES.map((svc, index) => (
          <Box
            key={svc.id}
            paddingX={2}
          >
            <Text
              color={activeTabIndex === index ? svc.color : THEME.colors.textMuted}
              bold={activeTabIndex === index}
              underline={activeTabIndex === index}
            >
              ● {svc.name}
            </Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {visibleLogs.length === 0 ? (
          <Text color={THEME.colors.textMuted}>No logs to display</Text>
        ) : (
          visibleLogs.map(log => (
            <LogLine key={log.id} entry={log} />
          ))
        )}
      </Box>
    </Box>
  );
};

const LogLine: React.FC<{ entry: LogEntry }> = ({ entry }) => {
  const time = formatTimestamp(entry.timestamp);
  const levelColor = LOG_LEVEL_COLORS[entry.level] || THEME.colors.textMuted;

  return (
    <Box>
      <Text color={THEME.colors.textMuted}>{time}</Text>
      <Text> </Text>
      <Text color={levelColor} bold>
        {formatLogLevel(entry.level).padStart(5)}
      </Text>
      <Text> </Text>
      <Text color={THEME.colors.textSecondary}>{entry.message}</Text>
    </Box>
  );
};
