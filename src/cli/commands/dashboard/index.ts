import { Command } from 'commander'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getDeerFlowPathWithInstanceId } from '../../../utils/env.js'

let globalDeerFlowPath: string | undefined;
let globalUsePath: string | undefined;

export function setGlobalDeerFlowPath(path: string | undefined): void {
  globalDeerFlowPath = path;
}

export function setGlobalUsePath(name: string | undefined): void {
  globalUsePath = name;
}

export function registerDashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .alias('dash')
    .description('Launch interactive TUI dashboard')
    .option('-d, --deerflow-path <path>', 'DeerFlow project path')
    .option('--no-monitor', 'Disable process monitoring')
    .action(async (options) => {
      const { path: deerflowPath, instanceId } = getDeerFlowPathWithInstanceId({
        cliPath: options.deerflowPath || globalDeerFlowPath,
        usePath: globalUsePath,
      })
      
      const currentDir = dirname(fileURLToPath(import.meta.url))
      const projectRoot = join(currentDir, '..', '..', '..', '..', '..')
      const dashboardPath = join(projectRoot, 'src', 'tui', 'dashboard.tsx')
      
      const env: Record<string, string> = {
        ...process.env,
        DEERFLOW_PATH: deerflowPath,
        INSTANCE_ID: instanceId,
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
