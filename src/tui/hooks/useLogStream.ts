import { useState, useCallback, useRef, useEffect } from 'react';
import { LogEntry, LogLevel } from '../types/index.js';

export interface UseLogStreamOptions {
  maxLogs?: number;
  initialLogs?: LogEntry[];
}

export interface UseLogStreamResult {
  logs: LogEntry[];
  addLog: (log: LogEntry) => void;
  clearLogs: () => void;
  subscribe: (callback: (log: LogEntry) => void) => () => void;
}

export function useLogStream(options: UseLogStreamOptions = {}): UseLogStreamResult {
  const { maxLogs = 100, initialLogs = [] } = options;

  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const subscribersRef = useRef<Set<(log: LogEntry) => void>>(new Set());

  const addLog = useCallback(
    (log: LogEntry) => {
      setLogs(prev => {
        const newLogs = [...prev, log];
        return newLogs.length > maxLogs ? newLogs.slice(-maxLogs) : newLogs;
      });

      subscribersRef.current.forEach(callback => callback(log));
    },
    [maxLogs]
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const subscribe = useCallback((callback: (log: LogEntry) => void) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  useEffect(() => {
    return () => {
      subscribersRef.current.clear();
    };
  }, []);

  return { logs, addLog, clearLogs, subscribe };
}

export function createMockLogEntry(serviceId: string, level: LogLevel, message: string): LogEntry {
  return {
    id: `${Date.now()}-${Math.random()}`,
    serviceId,
    timestamp: new Date(),
    level,
    message,
  };
}
