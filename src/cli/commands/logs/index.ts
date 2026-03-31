import { Command } from 'commander';
import chalk from 'chalk';
import type { IServiceManager, ServiceStatusInfo } from '../../../core/interfaces/IServiceManager';
import { CLIError, ErrorCode } from '../../utils/errors';
import { formatLogLevel } from '../../utils/format';
import { ServiceName } from '../../../types';

export function registerLogsCommand(
  program: Command,
  services: IServiceManager
): void {
  program
    .command('logs [service]')
    .description('View service logs')
    .option('-n, --lines <number>', 'Number of lines to show', '50')
    .option('-f, --follow', 'Follow log output', false)
    .option('-l, --level <level>', 'Filter by log level')
    .action(async (serviceName: string | undefined, options) => {
      const logService = services.getLogService();
      const lines = parseInt(options.lines) || 50;

      try {
        const target = serviceName as ServiceName | 'launcher' | undefined;
        
        const logs = await logService.getLogs(target || 'launcher', {
          lines,
          follow: options.follow,
          level: options.level
        });

        for (const line of logs) {
          console.log(line);
        }

        if (options.follow) {
          console.log(chalk.gray('\nPress Ctrl+C to exit...'));
        }

      } catch (error) {
        throw new CLIError(
          ErrorCode.UNKNOWN_ERROR,
          `Failed to get logs: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
}

export function registerLogsCleanCommand(
  program: Command,
  services: IServiceManager
): void {
  program
    .command('logs:clean [service]')
    .description('Clear service logs')
    .option('-a, --all', 'Clear all logs', false)
    .action(async (serviceName: string | undefined, options) => {
      const logService = services.getLogService();

      try {
        if (options.all) {
          const files = await logService.getLogFiles();
          for (const file of files) {
            console.log(chalk.gray(`Clearing ${file}...`));
          }
        } else if (serviceName) {
          await logService.clearLogs(serviceName as ServiceName);
          console.log(chalk.green(`✓ Cleared logs for ${serviceName}`));
        } else {
          await logService.clearLogs('launcher');
          console.log(chalk.green('✓ Cleared launcher logs'));
        }

      } catch (error) {
        throw new CLIError(
          ErrorCode.UNKNOWN_ERROR,
          `Failed to clear logs: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
}

export function registerLogsCommands(
  program: Command,
  services: IServiceManager
): void {
  registerLogsCommand(program, services);
  registerLogsCleanCommand(program, services);
}
