import { Command } from 'commander';
import chalk from 'chalk';
import {
  addPath,
  removePath,
  setDefaultPath,
  getPath,
  listPaths,
  loadConfig,
  PathConfig
} from '../../../modules/LauncherConfig.js';
import { CLIError, ErrorCode } from '../../utils/errors.js';
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

export function registerConfigPathCommands(configCmd: Command): void {
  const pathCmd = configCmd
    .command('path')
    .description('Manage DeerFlow project paths');

  pathCmd
    .command('add <name> <path>')
    .description('Add a DeerFlow project path')
    .option('-d, --description <desc>', 'Path description')
    .option('--default', 'Set as default path')
    .action((name: string, deerflowPath: string, options: { description?: string; default?: boolean }) => {
      const absolutePath = path.resolve(deerflowPath);
      const validation = validateDeerFlowPath(absolutePath);
      
      if (!validation.valid) {
        throw new CLIError(
          ErrorCode.ENV_DEERFLOW_NOT_FOUND,
          `Invalid DeerFlow path: ${validation.error}`,
          { suggestion: 'Ensure the path contains config.example.yaml or backend/frontend directories' }
        );
      }
      
      const existing = getPath(name);
      if (existing) {
        console.log(chalk.yellow(`Updating existing path "${name}"`));
      }
      
      addPath(name, absolutePath, options.description);
      
      if (options.default) {
        setDefaultPath(name);
      }
      
      const config = loadConfig();
      const isDefault = config.defaultPath === name;
      
      console.log(chalk.green(`✓ Added path "${name}": ${absolutePath}`));
      if (isDefault) {
        console.log(chalk.gray(`  (default)`));
      }
    });

  pathCmd
    .command('remove <name>')
    .description('Remove a DeerFlow project path')
    .action((name: string) => {
      const removed = removePath(name);
      
      if (!removed) {
        throw new CLIError(
          ErrorCode.CONFIG_KEY_NOT_FOUND,
          `Path "${name}" not found`
        );
      }
      
      console.log(chalk.green(`✓ Removed path "${name}"`));
    });

  pathCmd
    .command('default <name>')
    .description('Set the default DeerFlow project path')
    .action((name: string) => {
      const success = setDefaultPath(name);
      
      if (!success) {
        throw new CLIError(
          ErrorCode.CONFIG_KEY_NOT_FOUND,
          `Path "${name}" not found`
        );
      }
      
      console.log(chalk.green(`✓ Set default path to "${name}"`));
    });

  pathCmd
    .command('list')
    .description('List all configured DeerFlow project paths')
    .action(() => {
      const paths = listPaths();
      const config = loadConfig();
      
      if (paths.length === 0) {
        console.log(chalk.gray('No paths configured'));
        console.log();
        console.log('Add a path with:');
        console.log(chalk.cyan('  deerflow config path add <name> <path>'));
        return;
      }
      
      console.log(chalk.bold('Configured paths:'));
      console.log();
      
      for (const p of paths) {
        const isDefault = config.defaultPath === p.name;
        const prefix = isDefault ? chalk.green('*') : ' ';
        const defaultLabel = isDefault ? chalk.gray(' (default)') : '';
        const desc = p.description ? chalk.gray(` - ${p.description}`) : '';
        
        console.log(`  ${prefix} ${chalk.cyan(p.name)}: ${p.path}${defaultLabel}${desc}`);
      }
      
      console.log();
      console.log(chalk.gray(`Config file: ~/.deerflow/launcher.json`));
    });

  pathCmd
    .command('show [name]')
    .description('Show details of a specific path (or default if no name given)')
    .action((name?: string) => {
      const config = loadConfig();
      let targetPath: PathConfig | undefined;
      
      if (name) {
        targetPath = getPath(name);
        if (!targetPath) {
          throw new CLIError(
            ErrorCode.CONFIG_KEY_NOT_FOUND,
            `Path "${name}" not found`
          );
        }
      } else {
        targetPath = config.paths.find(p => p.name === config.defaultPath);
        if (!targetPath && config.paths.length > 0) {
          targetPath = config.paths[0];
        }
      }
      
      if (!targetPath) {
        console.log(chalk.gray('No paths configured'));
        return;
      }
      
      const isDefault = config.defaultPath === targetPath.name;
      
      console.log(chalk.bold(`Path: ${targetPath.name}`));
      console.log(`  Path: ${targetPath.path}`);
      if (targetPath.description) {
        console.log(`  Description: ${targetPath.description}`);
      }
      console.log(`  Default: ${isDefault ? chalk.green('Yes') : 'No'}`);
      
      const validation = validateDeerFlowPath(targetPath.path);
      console.log(`  Valid: ${validation.valid ? chalk.green('Yes') : chalk.red(validation.error!)}`);
    });
}
