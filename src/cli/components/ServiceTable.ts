import type { ServiceStatusInfo } from '../../core/interfaces/IServiceManager.js';
import { 
  formatStatusTable as formatProcessStatusTable, 
  formatSimpleList as formatProcessSimpleList,
  ProcessStatus 
} from '../../modules/ProcessMonitor.js';

export function formatServiceTable(services: ServiceStatusInfo[]): string {
  const processStatuses: ProcessStatus[] = services.map(svc => ({
    name: svc.name,
    status: svc.status,
    cpu: svc.cpu ? parseFloat(svc.cpu.replace('%', '')) : 0,
    memory: parseMemory(svc.memory),
    restarts: svc.restartCount,
    uptime: parseUptime(svc.uptime),
    pid: svc.pid,
    port: svc.port
  }));
  
  return formatProcessStatusTable(processStatuses);
}

export function formatSimpleList(services: ServiceStatusInfo[]): string {
  const processStatuses: ProcessStatus[] = services.map(svc => ({
    name: svc.name,
    status: svc.status,
    cpu: svc.cpu ? parseFloat(svc.cpu.replace('%', '')) : 0,
    memory: parseMemory(svc.memory),
    restarts: svc.restartCount,
    uptime: parseUptime(svc.uptime),
    pid: svc.pid,
    port: svc.port
  }));
  
  return formatProcessSimpleList(processStatuses);
}

function parseMemory(mem?: string): number {
  if (!mem) return 0;
  const match = mem.match(/^([\d.]+)\s*(B|KB|MB|GB)$/i);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024
  };
  
  return value * (multipliers[unit] || 1);
}

function parseUptime(uptime?: string): number {
  if (!uptime) return 0;
  
  let total = 0;
  
  const dayMatch = uptime.match(/(\d+)d/);
  const hourMatch = uptime.match(/(\d+)h/);
  const minMatch = uptime.match(/(\d+)m/);
  const secMatch = uptime.match(/(\d+)s/);
  
  if (dayMatch) total += parseInt(dayMatch[1]) * 24 * 60 * 60 * 1000;
  if (hourMatch) total += parseInt(hourMatch[1]) * 60 * 60 * 1000;
  if (minMatch) total += parseInt(minMatch[1]) * 60 * 1000;
  if (secMatch) total += parseInt(secMatch[1]) * 1000;
  
  return total;
}
