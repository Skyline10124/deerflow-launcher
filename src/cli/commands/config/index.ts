import { Command } from 'commander';
import chalk from 'chalk';
import type { IServiceManager } from '../../../core/interfaces/IServiceManager.js';
import { CLIError, ErrorCode } from '../../utils/errors.js';
import {
  loadConfig,
  getDeerflowPaths,
  getDeerflowPath,
  setDeerflowPath,
  removeDeerflowPath,
  setDefaultPath,
  getDefaultDeerflowPath,
  getConfigPath,
  PathConfig,
} from '../../../modules/LauncherConfig.js';
import * as fs from 'fs';
import * as path from 'path';

function validateDeerFlowPath(deerflowPath: string): { valid: boolean; error?: string } {
  if (!fs.existsSync(deerflowPath)) {
    return { valid: false, error: 'Path does not exist' };
  }
  
  const hasConfig = fs.existsSync(path.join(deerflowPath, 'config.example.yaml'));
  const hasBackend = fs.existsSync(path.join(deerflowPath, 'backend'));
  const hasFrontend = fs.existsSync(path.join(deerflowPath, 'frontend'));
  
  if (!hasConfig && !(hasBackend && hasFrontend)) {
    return { valid: false, error: 'Not a valid DeerFlow project (missing config.example.yaml or backend/frontend)' };
  }
  
  return { valid: true };
}

function formatPathOutput(p: PathConfig, isDefault: boolean): string {
  const lines: string[] = [];
  lines.push(`  ${isDefault ? chalk.green('*') : ' '} ${chalk.cyan(p.name)}: ${p.path}`);
  if (p.description) {
    lines.push(chalk.gray(`      ${p.description}`));
  }
  return lines.join('\n');
}

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
      const config = loadConfig();
      
      switch (key) {
        case 'deerflowPath':
        case 'currentPath': {
          const defaultPath = getDefaultDeerflowPath();
          if (!defaultPath) {
            console.log(chalk.gray('No deerflow paths configured'));
            return;
          }
          console.log(defaultPath.path);
          break;
        }
        
        case 'deerflowPaths':
        case 'paths': {
          const paths = getDeerflowPaths();
          if (paths.length === 0) {
            console.log(chalk.gray('No deerflow paths configured'));
            return;
          }
          console.log(chalk.bold('Configured paths:'));
          console.log();
          for (const p of paths) {
            const isDefault = config.defaultPath === p.name;
            console.log(formatPathOutput(p, isDefault));
          }
          console.log();
          console.log(chalk.gray(`Config file: ${getConfigPath()}`));
          break;
        }
        
        case 'defaultPath': {
          const defaultName = config.defaultPath;
          if (!defaultName) {
            console.log(chalk.gray('No default path set'));
            return;
          }
          console.log(defaultName);
          break;
        }
        
        case 'logDir':
        case 'services': {
          const configService = services.getConfigService();
          const value = await configService.get(key);
          if (value === undefined) {
            console.log(chalk.gray(`Key "${key}" not found`));
          } else if (typeof value === 'object') {
            console.log(JSON.stringify(value, null, 2));
          } else {
            console.log(value);
          }
          break;
        }
        
        default:
          console.log(chalk.gray(`Unknown key: ${key}`));
          console.log();
          console.log('Available keys:');
          console.log('  deerflowPath, currentPath  - Current active DeerFlow path');
          console.log('  deerflowPaths, paths       - List all configured paths');
          console.log('  defaultPath                - Default path name');
          console.log('  logDir                     - Log directory');
          console.log('  services                   - Service start order');
      }
    });

  configCmd
    .command('set <key> [value...]')
    .description('Set configuration value')
    .action(async (key: string, values: string[]) => {
      switch (key) {
        case 'deerflowPath':
        case 'path': {
          if (values.length < 2) {
            throw new CLIError(
              ErrorCode.INVALID_ARGUMENT,
              'Usage: config set deerflowPath <name> <path> [description]',
              { suggestion: 'Example: config set deerflowPath dev /path/to/deer-flow "Development environment"' }
            );
          }
          
          const [name, deerflowPath, ...descParts] = values;
          const absolutePath = path.resolve(deerflowPath);
          const description = descParts.join(' ') || undefined;
          
          const validation = validateDeerFlowPath(absolutePath);
          if (!validation.valid) {
            throw new CLIError(
              ErrorCode.ENV_DEERFLOW_NOT_FOUND,
              `Invalid DeerFlow path: ${validation.error}`,
              { suggestion: 'Ensure the path contains config.example.yaml or backend/frontend directories' }
            );
          }
          
          const existing = getDeerflowPath(name);
          if (existing) {
            console.log(chalk.yellow(`Updating existing path "${name}"`));
          }
          
          setDeerflowPath(name, absolutePath, description);
          console.log(chalk.green(`✓ Set deerflowPath "${name}": ${absolutePath}`));
          break;
        }
        
        case 'defaultPath':
        case 'default': {
          if (values.length < 1) {
            throw new CLIError(
              ErrorCode.INVALID_ARGUMENT,
              'Usage: config set defaultPath <name>'
            );
          }
          
          const name = values[0];
          const success = setDefaultPath(name);
          
          if (!success) {
            throw new CLIError(
              ErrorCode.CONFIG_KEY_NOT_FOUND,
              `Path "${name}" not found`
            );
          }
          
          console.log(chalk.green(`✓ Set default path to "${name}"`));
          break;
        }
        
        default:
          throw new CLIError(
            ErrorCode.INVALID_ARGUMENT,
            `Unknown config key: ${key}`,
            { suggestion: 'Available keys: deerflowPath, defaultPath' }
          );
      }
    });

  configCmd
    .command('unset <key> [value]')
    .description('Unset configuration value')
    .action(async (key: string, value?: string) => {
      switch (key) {
        case 'deerflowPath':
        case 'path': {
          if (!value) {
            throw new CLIError(
              ErrorCode.INVALID_ARGUMENT,
              'Usage: config unset deerflowPath <name>'
            );
          }
          
          const removed = removeDeerflowPath(value);
          if (!removed) {
            throw new CLIError(
              ErrorCode.CONFIG_KEY_NOT_FOUND,
              `Path "${value}" not found`
            );
          }
          
          console.log(chalk.green(`✓ Removed deerflowPath "${value}"`));
          break;
        }
        
        default:
          throw new CLIError(
            ErrorCode.INVALID_ARGUMENT,
            `Unknown config key: ${key}`,
            { suggestion: 'Available keys: deerflowPath' }
          );
      }
    });

  configCmd
    .command('list')
    .description('List all configuration values')
    .action(async () => {
      const config = loadConfig();
      const configService = services.getConfigService();
      
      console.log(chalk.bold('Configuration:'));
      console.log();
      
      console.log(chalk.gray('DeerFlow Paths:'));
      if (config.deerflowPaths.length === 0) {
        console.log(chalk.gray('  (none configured)'));
      } else {
        for (const p of config.deerflowPaths) {
          const isDefault = config.defaultPath === p.name;
          console.log(formatPathOutput(p, isDefault));
        }
      }
      console.log();
      
      console.log(chalk.gray('Other:'));
      console.log(`  Log directory: ${await configService.get('logDir')}`);
      console.log(`  Services: ${(await configService.get('services') as string[]).join(', ')}`);
      console.log();
      
      console.log(chalk.gray(`Config file: ${getConfigPath()}`));
    });

  configCmd
    .command('validate')
    .description('Validate configuration')
    .action(async () => {
      const configService = services.getConfigService();
      const config = loadConfig();
      const errors: string[] = [];
      
      const result = await configService.validate();
      if (!result.valid) {
        errors.push(...result.errors);
      }
      
      for (const p of config.deerflowPaths) {
        const validation = validateDeerFlowPath(p.path);
        if (!validation.valid) {
          errors.push(`Path "${p.name}": ${validation.error}`);
        }
      }

      if (errors.length === 0) {
        console.log(chalk.green('✓ Configuration is valid'));
      } else {
        console.log(chalk.red('✗ Configuration has errors:\n'));
        for (const error of errors) {
          console.log(chalk.red(`  - ${error}`));
        }
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
