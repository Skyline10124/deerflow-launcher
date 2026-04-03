import { Command } from 'commander'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

export function registerDashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .alias('dash')
    .description('Launch interactive TUI dashboard')
    .option('-d, --deerflow-path <path>', 'DeerFlow project path', process.cwd())
    .option('--no-monitor', 'Disable process monitoring')
    .action(async (options) => {
      const currentDir = dirname(fileURLToPath(import.meta.url))
      const projectRoot = join(currentDir, '..', '..', '..', '..', '..')
      const dashboardPath = join(projectRoot, 'src', 'tui', 'dashboard.tsx')
      
      const env: Record<string, string> = {
        ...process.env,
        DEERFLOW_PATH: options.deerflowPath,
        NO_MONITOR: options.noMonitor ? 'true' : 'false',
      }
      
      const child = spawn('npx', ['tsx', dashboardPath], {
        stdio: 'inherit',
        shell: true,
        env,
      })
      
      child.on('close', (code) => {
        process.exit(code ?? 0)
      })
    })
}
