import {
  LaunchContext,
  LaunchStatus,
  ServiceInstance,
  ServiceName,
  ServiceStatus
} from '../types/index.js';
import { SERVICE_START_ORDER, SERVICE_PORTS } from '../config/services.js';

export function createLaunchContext(deerflowPath: string, logDir: string): LaunchContext {
  const services = new Map<ServiceName, ServiceInstance>();

  for (const name of SERVICE_START_ORDER) {
    services.set(name, {
      name,
      status: ServiceStatus.PENDING,
      port: SERVICE_PORTS[name]
    });
  }

  return {
    status: LaunchStatus.IDLE,
    services,
    deerflowPath,
    logDir,
    startTime: new Date()
  };
}

export function updateServiceStatus(
  context: LaunchContext,
  serviceName: ServiceName,
  status: ServiceStatus,
  updates?: Partial<ServiceInstance>
): void {
  const service = context.services.get(serviceName);
  if (service) {
    service.status = status;
    if (updates) {
      Object.assign(service, updates);
    }
  }
}

export function getServiceInstance(
  context: LaunchContext,
  serviceName: ServiceName
): ServiceInstance | undefined {
  return context.services.get(serviceName);
}

export function getAllServices(context: LaunchContext): ServiceInstance[] {
  return Array.from(context.services.values());
}

export function getHealthyServices(context: LaunchContext): ServiceInstance[] {
  return getAllServices(context).filter(
    (s) => s.status === ServiceStatus.HEALTHY
  );
}

export function getFailedServices(context: LaunchContext): ServiceInstance[] {
  return getAllServices(context).filter(
    (s) => s.status === ServiceStatus.FAILED
  );
}

export function setLaunchStatus(context: LaunchContext, status: LaunchStatus): void {
  context.status = status;
}

export function getElapsedSeconds(context: LaunchContext): number {
  return Math.floor((Date.now() - context.startTime.getTime()) / 1000);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function printContextSummary(context: LaunchContext): string {
  const lines: string[] = [];
  lines.push(`Status: ${context.status}`);
  lines.push(`DeerFlow Path: ${context.deerflowPath}`);
  lines.push(`Log Directory: ${context.logDir}`);
  lines.push(`Elapsed: ${formatDuration(getElapsedSeconds(context))}`);
  lines.push('Services:');
  
  for (const service of getAllServices(context)) {
    const statusIcon = service.status === ServiceStatus.HEALTHY ? '✓' :
                       service.status === ServiceStatus.FAILED ? '✗' :
                       service.status === ServiceStatus.STARTING ? '⏳' : '○';
    lines.push(`  ${statusIcon} ${service.name}: ${service.status} (port ${service.port})`);
    if (service.error) {
      lines.push(`    Error: ${service.error}`);
    }
  }
  
  return lines.join('\n');
}
