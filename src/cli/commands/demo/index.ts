import { Command } from 'commander'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

export function registerDemoCommand(program: Command): void {
  program
    .command('demo')
    .description('Launch TUI demo dashboard')
    .action(async () => {
      const currentDir = dirname(fileURLToPath(import.meta.url))
      const demoPath = join(currentDir, '..', '..', '..', 'tui', 'screens', 'DemoDashboard.tsx')
      
      const child = spawn('npx', ['tsx', demoPath], {
        stdio: 'inherit',
        shell: true
      })
      
      child.on('close', (code) => {
        process.exit(code ?? 0)
      })
    })
}
