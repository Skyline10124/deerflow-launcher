import { Command } from 'commander';
import chalk from 'chalk';
import type { IServiceManager } from '../../../core/interfaces/IServiceManager';
import { ErrorCode, ErrorMessages, ErrorSuggestions } from '../../utils/errors';

interface EnvCheck {
  name: string;
  check: () => Promise<{ ok: boolean; message?: string }>;
  errorCode: ErrorCode;
}

export function registerDoctorCommand(
  program: Command,
  _services: IServiceManager
): void {
  program
    .command('doctor')
    .description('Run environment diagnostics')
    .option('-f, --fix', 'Attempt to fix issues', false)
    .action(async (options) => {
      console.log(chalk.bold.cyan('\n🔍 DeerFlow Environment Diagnostics\n'));

      const checks: EnvCheck[] = [
        {
          name: 'Node.js version',
          errorCode: ErrorCode.ENV_NODE_VERSION,
          check: async () => {
            const version = process.version;
            const major = parseInt(version.slice(1).split('.')[0]);
            if (major >= 18) {
              return { ok: true, message: `v${version}` };
            }
            return { ok: false, message: `v${version} (requires >= 18)` };
          }
        },
        {
          name: 'PM2 installed',
          errorCode: ErrorCode.ENV_PM2_NOT_FOUND,
          check: async () => {
            try {
              const { exec } = await import('child_process');
              const { promisify } = await import('util');
              const execAsync = promisify(exec);
              await execAsync('pm2 --version');
              return { ok: true, message: 'installed' };
            } catch {
              return { ok: false, message: 'not found' };
            }
          }
        },
        {
          name: 'Python installed',
          errorCode: ErrorCode.ENV_PYTHON_MISSING,
          check: async () => {
            try {
              const { exec } = await import('child_process');
              const { promisify } = await import('util');
              const execAsync = promisify(exec);
              const { stdout } = await execAsync('python --version');
              return { ok: true, message: stdout.trim() };
            } catch {
              try {
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);
                const { stdout } = await execAsync('python3 --version');
                return { ok: true, message: stdout.trim() };
              } catch {
                return { ok: false, message: 'not found' };
              }
            }
          }
        },
        {
          name: 'uv installed',
          errorCode: ErrorCode.ENV_UV_MISSING,
          check: async () => {
            try {
              const { exec } = await import('child_process');
              const { promisify } = await import('util');
              const execAsync = promisify(exec);
              const { stdout } = await execAsync('uv --version');
              return { ok: true, message: stdout.trim().split('\n')[0] };
            } catch {
              return { ok: false, message: 'not found' };
            }
          }
        },
        {
          name: 'pnpm installed',
          errorCode: ErrorCode.ENV_PNPM_MISSING,
          check: async () => {
            try {
              const { exec } = await import('child_process');
              const { promisify } = await import('util');
              const execAsync = promisify(exec);
              const { stdout } = await execAsync('pnpm --version');
              return { ok: true, message: `v${stdout.trim()}` };
            } catch {
              return { ok: false, message: 'not found' };
            }
          }
        },
        {
          name: 'nginx installed',
          errorCode: ErrorCode.ENV_NGINX_MISSING,
          check: async () => {
            try {
              const { exec } = await import('child_process');
              const { promisify } = await import('util');
              const execAsync = promisify(exec);
              const { stdout } = await execAsync('nginx -v 2>&1');
              return { ok: true, message: stdout.trim() };
            } catch {
              return { ok: false, message: 'not found (optional for frontend)' };
            }
          }
        },
        {
          name: 'DeerFlow directory',
          errorCode: ErrorCode.ENV_DEERFLOW_NOT_FOUND,
          check: async () => {
            const deerflowPath = process.env.DEERFLOW_PATH || process.cwd();
            const fs = await import('fs/promises');
            try {
              await fs.access(deerflowPath);
              return { ok: true, message: deerflowPath };
            } catch {
              return { ok: false, message: `${deerflowPath} not found` };
            }
          }
        }
      ];

      const results: Array<{ name: string; ok: boolean; message?: string; errorCode: ErrorCode }> = [];

      for (const check of checks) {
        const result = await check.check();
        results.push({
          name: check.name,
          ok: result.ok,
          message: result.message,
          errorCode: check.errorCode
        });

        const icon = result.ok ? chalk.green('✓') : chalk.red('✗');
        const status = result.ok 
          ? chalk.green(result.message || 'OK')
          : chalk.red(result.message || 'FAILED');
        console.log(`  ${icon} ${check.name.padEnd(20)} ${status}`);
      }

      const failed = results.filter(r => !r.ok);
      
      console.log('');
      
      if (failed.length === 0) {
        console.log(chalk.green('✓ All checks passed!\n'));
      } else {
        console.log(chalk.yellow(`⚠ ${failed.length} check(s) failed:\n`));
        
        for (const fail of failed) {
          console.log(chalk.red(`  ${fail.name}:`));
          console.log(chalk.gray(`    ${ErrorMessages[fail.errorCode]}`));
          console.log(chalk.cyan(`    Suggestion: ${ErrorSuggestions[fail.errorCode]}`));
          console.log('');
        }

        if (options.fix) {
          console.log(chalk.yellow('Attempting to fix issues...\n'));
          // Fix logic would go here
        }
      }
    });
}

export function registerDoctorCommands(
  program: Command,
  services: IServiceManager
): void {
  registerDoctorCommand(program, services);
}
