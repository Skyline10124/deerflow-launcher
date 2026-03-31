import Table from 'cli-table3';
import chalk from 'chalk';
import type { ServiceStatusInfo } from '../../core/interfaces/IServiceManager';
import { formatStatus, formatBytes, formatUptime } from '../utils/format';

export interface ServiceTableOptions {
  showPorts?: boolean;
  compact?: boolean;
}

export function formatServiceTable(
  services: ServiceStatusInfo[],
  options: ServiceTableOptions = {}
): string {
  const { compact = false } = options;

  if (services.length === 0) {
    return chalk.gray('No services found');
  }

  const table = new Table({
    head: compact 
      ? ['Service', 'Status', 'Memory']
      : ['Service', 'Status', 'CPU', 'Memory', 'PID', 'Uptime', 'Restarts'],
    style: { 
      head: ['cyan', 'bold'],
      border: compact ? [] : ['gray']
    },
    colWidths: compact 
      ? [12, 12, 12]
      : [12, 12, 8, 12, 8, 12, 10]
  });

  for (const svc of services) {
    const row = compact
      ? [
          chalk.bold(svc.name),
          formatStatus(svc.status),
          svc.memory || '-'
        ]
      : [
          chalk.bold(svc.name),
          formatStatus(svc.status),
          svc.cpu || '-',
          svc.memory || '-',
          svc.pid?.toString() || '-',
          svc.uptime || '-',
          svc.restartCount.toString()
        ];
    
    table.push(row);
  }

  return table.toString();
}

export function formatSimpleList(services: ServiceStatusInfo[]): string {
  const lines: string[] = [];
  
  for (const svc of services) {
    const statusIcon = svc.status === 'online' ? chalk.green('●')
      : svc.status === 'offline' ? chalk.gray('○')
      : svc.status === 'errored' ? chalk.red('●')
      : chalk.yellow('●');
    
    lines.push(
      `${statusIcon} ${chalk.bold(svc.name.padEnd(12))} ` +
      `${formatStatus(svc.status).padEnd(10)} ` +
      `${chalk.gray(svc.memory || '--')} ` +
      `${chalk.gray(svc.uptime || '--')}`
    );
  }
  
  return lines.join('\n');
}
