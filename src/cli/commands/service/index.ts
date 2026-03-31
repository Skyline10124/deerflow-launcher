import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import type { IServiceManager, ServiceStatusInfo } from '../../../core/interfaces/IServiceManager';
import { CLIError, ErrorCode } from '../../utils/errors';
import { formatServiceTable, formatSimpleList } from '../../components/ServiceTable';
import { confirmDestructive } from '../../components/ConfirmPrompt';

export function registerStartCommand(
  program: Command, 
  services: IServiceManager
): void {
  program
    .command('start [services...]')
    .description('Start DeerFlow services')
    .option('-w, --watch', 'Watch configuration files for changes', false)
    .option('-d, --detach', 'Run services in background', false)
    .option('-t, --timeout <seconds>', 'Startup timeout', '60')
    .action(async (serviceNames: string[], options) => {
      const timeout = parseInt(options.timeout);
      if (isNaN(timeout) || timeout < 1) {
        throw new CLIError(
          ErrorCode.INVALID_ARGUMENT,
          'Timeout must be a positive number'
        );
      }

      const spinner = ora({
        text: 'Starting services...',
        spinner: 'dots'
      }).start();

      try {
        await services.start({
          only: serviceNames.length > 0 ? serviceNames as any : undefined,
          watch: options.watch,
          detached: options.detach,
          timeout
        });

        spinner.succeed(chalk.green('Services started successfully'));

        const statuses = await services.getAllStatus();
        console.log('\n' + formatServiceTable(statuses));

      } catch (error) {
        spinner.fail();
        
        if (error instanceof CLIError) {
          throw error;
        }
        
        throw new CLIError(
          ErrorCode.SERVICE_START_FAILED,
          `Failed to start services: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error instanceof Error ? error : undefined }
        );
      }
    });
}

export function registerStopCommand(
  program: Command,
  services: IServiceManager
): void {
  program
    .command('stop [services...]')
    .description('Stop DeerFlow services')
    .option('-f, --force', 'Force stop all services', false)
    .option('-t, --timeout <seconds>', 'Stop timeout', '30')
    .action(async (serviceNames: string[], options) => {
      if (options.force && serviceNames.length === 0) {
        const confirmed = await confirmDestructive('STOP ALL RUNNING SERVICES');
        if (!confirmed) {
          console.log(chalk.gray('Operation cancelled'));
          return;
        }
      }

      const spinner = ora({
        text: 'Stopping services...',
        spinner: 'dots'
      }).start();

      try {
        await services.stop({
          only: serviceNames.length > 0 ? serviceNames as any : undefined,
          force: options.force,
          timeout: parseInt(options.timeout)
        });

        spinner.succeed(chalk.green('Services stopped successfully'));

        const statuses = await services.getAllStatus();
        console.log('\n' + formatServiceTable(statuses));

      } catch (error) {
        spinner.fail();
        
        if (error instanceof CLIError) {
          throw error;
        }
        
        throw new CLIError(
          ErrorCode.SERVICE_STOP_FAILED,
          `Failed to stop services: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error instanceof Error ? error : undefined }
        );
      }
    });
}

export function registerStatusCommand(
  program: Command,
  services: IServiceManager
): void {
  program
    .command('status [service]')
    .description('Show service status')
    .option('-j, --json', 'Output as JSON', false)
    .option('-c, --compact', 'Compact output', false)
    .action(async (serviceName: string | undefined, options) => {
      try {
        let statuses: ServiceStatusInfo[];
        
        if (serviceName) {
          const result = await services.getStatus(serviceName as any);
          statuses = Array.isArray(result) ? result : [result];
        } else {
          statuses = await services.getAllStatus();
        }

        if (options.json) {
          console.log(JSON.stringify(statuses, null, 2));
        } else if (options.compact) {
          console.log(formatSimpleList(statuses));
        } else {
          console.log(formatServiceTable(statuses));
        }

      } catch (error) {
        throw new CLIError(
          ErrorCode.SERVICE_NOT_FOUND,
          `Failed to get status: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
}

export function registerRestartCommand(
  program: Command,
  services: IServiceManager
): void {
  program
    .command('restart [services...]')
    .description('Restart DeerFlow services')
    .action(async (serviceNames: string[]) => {
      const spinner = ora({
        text: 'Restarting services...',
        spinner: 'dots'
      }).start();

      try {
        await services.restart(serviceNames.length > 0 ? serviceNames as any : undefined);

        spinner.succeed(chalk.green('Services restarted successfully'));

        const statuses = await services.getAllStatus();
        console.log('\n' + formatServiceTable(statuses));

      } catch (error) {
        spinner.fail();
        
        throw new CLIError(
          ErrorCode.SERVICE_START_FAILED,
          `Failed to restart services: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error instanceof Error ? error : undefined }
        );
      }
    });
}

export function registerServiceCommands(
  program: Command,
  services: IServiceManager
): void {
  const serviceCmd = program
    .command('service')
    .alias('svc')
    .description('Service management commands');

  registerStartCommand(serviceCmd, services);
  registerStopCommand(serviceCmd, services);
  registerStatusCommand(serviceCmd, services);
  registerRestartCommand(serviceCmd, services);
}
