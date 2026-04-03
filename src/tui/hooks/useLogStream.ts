import { useState, useCallback, useRef, useEffect } from 'react';
import { LogEntry, LogLevel } from '../types/index.js';

export interface UseLogStreamOptions {
  maxLogs?: number;
  initialLogs?: LogEntry[];
  batchInterval?: number;
}

export interface UseLogStreamResult {
  logs: LogEntry[];
  addLog: (log: LogEntry) => void;
  clearLogs: () => void;
  subscribe: (callback: (log: LogEntry) => void) => () => void;
}

export function useLogStream(options: UseLogStreamOptions = {}): UseLogStreamResult {
  const { maxLogs = 100, initialLogs = [], batchInterval = 100 } = options;

  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const subscribersRef = useRef<Set<(log: LogEntry) => void>>(new Set());
  const pendingLogsRef = useRef<LogEntry[]>([]);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const flushLogs = useCallback(() => {
    if (pendingLogsRef.current.length === 0) return;

    const pending = pendingLogsRef.current;
    pendingLogsRef.current = [];

    setLogs(prev => {
      const newLogs = [...prev, ...pending];
      const trimmed = newLogs.length > maxLogs ? newLogs.slice(-maxLogs) : newLogs;
      return trimmed;
    });

    pending.forEach(log => {
      subscribersRef.current.forEach(callback => callback(log));
    });
  }, [maxLogs]);

  const addLog = useCallback(
    (log: LogEntry) => {
      pendingLogsRef.current.push(log);

      if (!flushTimeoutRef.current) {
        flushTimeoutRef.current = setTimeout(() => {
          flushTimeoutRef.current = null;
          flushLogs();
        }, batchInterval);
      }
    },
    [batchInterval, flushLogs]
  );

  const clearLogs = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
    pendingLogsRef.current = [];
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
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
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
