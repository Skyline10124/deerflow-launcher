import { useState, useEffect, useCallback } from 'react'
import { ServiceInfo, ServiceStatus } from '../types/index.js'

export interface UseServiceStatusOptions {
  interval?: number
  initialServices?: ServiceInfo[]
}

export interface UseServiceStatusResult {
  services: ServiceInfo[]
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
  updateService: (name: string, updates: Partial<ServiceInfo>) => void
}

export function useServiceStatus(
  fetchStatus: () => Promise<ServiceInfo[]>,
  options: UseServiceStatusOptions = {}
): UseServiceStatusResult {
  const { interval = 1000, initialServices = [] } = options
  
  const [services, setServices] = useState<ServiceInfo[]>(initialServices)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    try {
      const status = await fetchStatus()
      setServices(status)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [fetchStatus])

  const updateService = useCallback((name: string, updates: Partial<ServiceInfo>) => {
    setServices(prev => 
      prev.map(service => 
        service.name === name 
          ? { ...service, ...updates } 
          : service
      )
    )
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, interval)
    return () => clearInterval(timer)
  }, [refresh, interval])

  return { services, loading, error, refresh, updateService }
}

export function createMockServiceStatus(): ServiceInfo[] {
  return [
    { name: 'langgraph', status: ServiceStatus.ONLINE, port: 2024, pid: 1001, cpu: 5, memory: 150 * 1024 * 1024 },
    { name: 'gateway', status: ServiceStatus.ONLINE, port: 8001, pid: 1002, cpu: 3, memory: 80 * 1024 * 1024 },
    { name: 'frontend', status: ServiceStatus.ONLINE, port: 3000, pid: 1003, cpu: 2, memory: 120 * 1024 * 1024 },
    { name: 'nginx', status: ServiceStatus.ONLINE, port: 2026, pid: 1004, cpu: 1, memory: 30 * 1024 * 1024 },
  ]
}
