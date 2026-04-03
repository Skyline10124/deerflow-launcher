import { useState, useEffect, useCallback, useRef } from 'react'
import { LogEntry, LogLevel } from '../types'

export interface UseLogStreamOptions {
  maxLogs?: number
  initialLogs?: LogEntry[]
}

export interface UseLogStreamResult {
  logs: LogEntry[]
  addLog: (log: LogEntry) => void
  clearLogs: () => void
  subscribe: (callback: (log: LogEntry) => void) => () => void
}

export function useLogStream(options: UseLogStreamOptions = {}): UseLogStreamResult {
  const { maxLogs = 1000, initialLogs = [] } = options
  
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs)
  const subscribersRef = useRef<Set<(log: LogEntry) => void>>(new Set())

  const addLog = useCallback((log: LogEntry) => {
    setLogs(prev => {
      const newLogs = [...prev, log]
      return newLogs.length > maxLogs ? newLogs.slice(-maxLogs) : newLogs
    })
    
    subscribersRef.current.forEach(callback => callback(log))
  }, [maxLogs])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  const subscribe = useCallback((callback: (log: LogEntry) => void) => {
    subscribersRef.current.add(callback)
    return () => {
      subscribersRef.current.delete(callback)
    }
  }, [])

  useEffect(() => {
    return () => {
      subscribersRef.current.clear()
    }
  }, [])

  return { logs, addLog, clearLogs, subscribe }
}

export function createMockLogEntry(service: string, level: LogLevel, message: string): LogEntry {
  const now = new Date()
  const timestamp = now.toTimeString().slice(0, 8)
  return { timestamp, service, level, message }
}
