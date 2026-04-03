import React from 'react'
import { render } from 'ink'
import { LauncherProvider } from './context/LauncherContext.js'
import { DashboardScreen } from './screens/DashboardScreen.js'
import { Launcher } from '../core/Launcher.js'
import { ProcessManager } from '../modules/ProcessManager.js'
import { LogManager } from '../modules/LogManager.js'
import { ProcessMonitor } from '../modules/ProcessMonitor.js'
import { getLogger, LogLevel } from '../modules/Logger.js'
import path from 'path'

async function main() {
  const deerflowPath = process.env.DEERFLOW_PATH ?? process.cwd()
  const instanceId = process.env.INSTANCE_ID ?? 'default'
  const logDir = path.join(deerflowPath, 'logs')
  const noMonitor = process.env.NO_MONITOR === 'true'
  
  const logger = getLogger('Dashboard', {
    level: LogLevel.INFO,
    logDir,
  })
  
  const processManager = new ProcessManager(logDir, deerflowPath, instanceId)
  const logManager = new LogManager(logDir)
  const processMonitor = new ProcessMonitor({}, instanceId)
  
  try {
    await processManager.connect()
    
    if (!noMonitor) {
      await processMonitor.connect()
    }
    
    const launcher = new Launcher({
      deerflowPath,
      logDir,
      logLevel: LogLevel.INFO,
      instanceId,
    })
    
    const cleanup = async () => {
      logger.info('Closing dashboard...')
      if (!noMonitor) {
        processMonitor.stopMonitoring()
        try {
          await processMonitor.disconnect()
        } catch {}
      }
      try {
        await processManager.disconnect()
      } catch {}
    }
    
    const App = () => (
      <LauncherProvider
        launcher={launcher}
        processManager={processManager}
        logManager={logManager}
        processMonitor={processMonitor}
      >
        <DashboardScreen onExit={cleanup} />
      </LauncherProvider>
    )
    
    const { unmount } = render(<App />)
    
    process.on('SIGINT', async () => {
      unmount()
      await cleanup()
      process.exit(0)
    })
    
    process.on('SIGTERM', async () => {
      unmount()
      await cleanup()
      process.exit(0)
    })
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    logger.error(`Failed to start dashboard: ${errorMsg}`)
    process.exit(1)
  }
}

main()
