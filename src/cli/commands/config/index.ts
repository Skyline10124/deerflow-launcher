import { Command } from 'commander';
import chalk from 'chalk';
import type { IServiceManager } from '../../../core/interfaces/IServiceManager';
import { CLIError, ErrorCode } from '../../utils/errors';

export function registerConfigCommands(
  program: Command,
  services: IServiceManager
): void {
  const configCmd = program
    .command('config [command]')
    .description('Configuration management commands');

  configCmd
    .command('get <key>')
    .description('Get configuration value')
    .action(async (key: string) => {
      const configService = services.getConfigService();

      try {
        const value = await configService.get(key);
        
        if (value === undefined) {
          console.log(chalk.gray(`Key "${key}" not found`));
        } else if (typeof value === 'object') {
          console.log(JSON.stringify(value, null, 2));
        } else {
          console.log(value);
        }

      } catch (error) {
        throw new CLIError(
          ErrorCode.CONFIG_PARSE_ERROR,
          `Failed to get config: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

  configCmd
    .command('set <key> <value>')
    .description('Set configuration value')
    .action(async (key: string, value: string) => {
      const configService = services.getConfigService();

      try {
        let parsedValue: unknown = value;
        
        try {
          parsedValue = JSON.parse(value);
        } catch {
          // Keep as string if not valid JSON
        }

        await configService.set(key, parsedValue);
        console.log(chalk.green(`✓ Set ${key} = ${JSON.stringify(parsedValue)}`));

      } catch (error) {
        throw new CLIError(
          ErrorCode.CONFIG_PARSE_ERROR,
          `Failed to set config: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

  configCmd
    .command('validate')
    .description('Validate configuration')
    .action(async () => {
      const configService = services.getConfigService();

      try {
        const result = await configService.validate();

        if (result.valid) {
          console.log(chalk.green('✓ Configuration is valid'));
        } else {
          console.log(chalk.red('✗ Configuration has errors:\n'));
          for (const error of result.errors) {
            console.log(chalk.red(`  - ${error}`));
          }
        }

      } catch (error) {
        throw new CLIError(
          ErrorCode.CONFIG_VALIDATION_FAILED,
          `Failed to validate config: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

  configCmd
    .command('init')
    .description('Initialize configuration')
    .action(async () => {
      const configService = services.getConfigService();

      try {
        await configService.init();
        console.log(chalk.green('✓ Configuration initialized'));

      } catch (error) {
        throw new CLIError(
          ErrorCode.CONFIG_PARSE_ERROR,
          `Failed to init config: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
}
