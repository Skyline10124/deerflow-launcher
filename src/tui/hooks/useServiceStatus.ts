import { useState, useEffect, useCallback } from 'react';
import { Service, ServiceStatus } from '../types/index.js';

export interface UseServiceStatusOptions {
  interval?: number;
  initialServices?: Service[];
}

export interface UseServiceStatusResult {
  services: Service[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  updateService: (id: string, updates: Partial<Service>) => void;
}

export function useServiceStatus(
  fetchStatus: () => Promise<Service[]>,
  options: UseServiceStatusOptions = {}
): UseServiceStatusResult {
  const { interval = 1000, initialServices = [] } = options;

  const [services, setServices] = useState<Service[]>(initialServices);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await fetchStatus();
      setServices(status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  const updateService = useCallback((id: string, updates: Partial<Service>) => {
    setServices(prev =>
      prev.map(service =>
        service.id === id ? { ...service, ...updates } : service
      )
    );
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, interval);
    return () => clearInterval(timer);
  }, [refresh, interval]);

  return { services, loading, error, refresh, updateService };
}

export function createMockServiceStatus(): Service[] {
  return [
    {
      id: 'langgraph',
      name: 'LangGraph',
      port: 2024,
      description: 'AI Workflow Engine',
      status: ServiceStatus.ONLINE,
      pid: 1001,
      cpu: 5,
      memory: 150 * 1024 * 1024,
    },
    {
      id: 'gateway',
      name: 'Gateway',
      port: 8001,
      description: 'FastAPI Proxy',
      status: ServiceStatus.ONLINE,
      pid: 1002,
      cpu: 3,
      memory: 80 * 1024 * 1024,
    },
    {
      id: 'frontend',
      name: 'Frontend',
      port: 3000,
      description: 'React Dashboard',
      status: ServiceStatus.ONLINE,
      pid: 1003,
      cpu: 2,
      memory: 120 * 1024 * 1024,
    },
    {
      id: 'nginx',
      name: 'Nginx',
      port: 2026,
      description: 'Reverse Proxy',
      status: ServiceStatus.ONLINE,
      pid: 1004,
      cpu: 1,
      memory: 30 * 1024 * 1024,
    },
  ];
}
