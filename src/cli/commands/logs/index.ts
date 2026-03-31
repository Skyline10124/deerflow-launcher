import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import type { IServiceManager, ServiceStatusInfo } from '../../../core/interfaces/IServiceManager';
import { CLIError, ErrorCode } from '../../utils/errors';
import { formatLogLevel, formatTimestamp, LogFormatOptions } from '../../utils/format';
import { ServiceName } from '../../../types';

function formatLogLine(line: string, options: LogFormatOptions = {}): string {
  const timestampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/);
  const levelMatch = line.match(/\[(DEBUG|INFO|WARN|ERROR)\]/i);
  const serviceMatch = line.match(/\[([A-Za-z]+)\]/g);
  
  let formatted = line;
  
  if (timestampMatch && options.showTimestamp !== false) {
    const date = new Date(timestampMatch[1]);
    const timeStr = formatTimestamp(date, options.timeFormat || 'time');
    formatted = formatted.replace(timestampMatch[0], chalk.gray(`[${timeStr}]`));
  }
  
  if (levelMatch && options.showLevel !== false) {
    const level = levelMatch[1].toLowerCase();
    formatted = formatted.replace(levelMatch[0], formatLogLevel(level));
  }
  
  return formatted;
}

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
    .option('-t, --time-format <format>', 'Time format: ISO, time, relative', 'time')
    .action(async (serviceName: string | undefined, options) => {
      const logService = services.getLogService();
      const lines = parseInt(options.lines) || 50;

      try {
        const target = serviceName as ServiceName | 'launcher' | undefined;
        
        const formatOptions: LogFormatOptions = {
          showTimestamp: true,
          showLevel: true,
          timeFormat: options.timeFormat
        };

        const logs = await logService.getLogs(target || 'launcher', {
          lines,
          level: options.level
        });

        for (const line of logs) {
          console.log(formatLogLine(line, formatOptions));
        }

        if (options.follow) {
          const promptLine = chalk.gray('Press Ctrl+C to exit...');
          process.stdout.write(promptLine + '\n');
          
          const stopWatching = logService.watchLogs(target || 'launcher', (line) => {
            if (options.level) {
              const level = options.level.toUpperCase();
              if (!line.includes(`[${level}]`)) return;
            }
            readline.moveCursor(process.stdout, 0, -1);
            readline.clearLine(process.stdout, 0);
            console.log(formatLogLine(line, formatOptions));
            process.stdout.write(promptLine + '\n');
          });

          process.on('SIGINT', () => {
            stopWatching();
            readline.moveCursor(process.stdout, 0, -1);
            readline.clearLine(process.stdout, 0);
            process.exit(0);
          });

          await new Promise(() => {});
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
          await logService.clearAllLogs();
          console.log(chalk.green('✓ Cleared all logs'));
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
