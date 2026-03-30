# DeerFlow Launcher Debug 总结

本文档记录了 M2 阶段开发过程中遇到的问题及其解决方案。

***

## 1. CLI 命令无响应

### 1.1 问题描述

执行 `npm run cli status`、`npm run cli doctor`、`npm run cli logs` 等命令时，程序静默退出，无任何输出。

### 1.2 问题原因

`cli.ts` 中定义了 `runCLI()` 函数，但从未调用它。

### 1.3 解决方案

在 `cli.ts` 文件末尾添加函数调用：

```typescript
runCLI().catch((error) => {
  console.error('CLI error:', error);
  process.exit(1);
});
```

### 1.4 相关文件

- `src/cli.ts`

***

## 2. Windows 上 CPU/Memory 无法捕获

### 2.1 问题描述

`npm run cli status` 显示所有服务的 CPU 为 0%，Memory 为 0B。

### 2.2 问题原因

PM2 在 Windows 上使用 wrapper 进程包装非 Node.js 进程。`pm2.list()` 返回的 `monit.cpu` 和 `monit.memory` 始终为 0，因为它们反映的是 wrapper 进程而非实际服务进程的指标。

### 2.3 解决方案

使用 PowerShell Core (`pwsh`) 通过 `Get-CimInstance` 获取实际进程的 CPU 和内存：

```typescript
private async getWindowsProcessMetrics(pid: number): Promise<{ cpu: number; memory: number }> {
  const script = `
    $proc = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "IDProcess = ${pid}"
    if ($proc) {
      "$($proc.PercentProcessorTime)|$($proc.WorkingSet)"
    } else {
      "0|0"
    }
  `;
  
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('pwsh', ['-EncodedCommand', encodedScript], {
    encoding: 'utf-8',
    timeout: 5000
  });
  
  const [cpu, memory] = result.stdout.trim().split('|').map(Number);
  return { cpu, memory };
}
```

### 2.4 注意事项

- 使用 `Get-CimInstance` 而非 `Get-WmiObject`（后者在 PowerShell Core 中已移除）
- 使用 `-EncodedCommand` 传递 Base64 编码的脚本，避免命令行转义问题
- 需要确保系统安装了 PowerShell Core (`pwsh`)

### 2.5 相关文件

- `src/modules/ProcessMonitor.ts`

***

## 3. ProcessMonitor 自动重启不工作

### 3.1 问题描述

服务崩溃后不会自动重启，ProcessMonitor 的进程守护功能未生效。

### 3.2 问题原因

`ProcessMonitor.startMonitoring()` 方法从未被调用。虽然 ProcessMonitor 被实例化，但监控循环从未启动。

### 3.3 解决方案

在 `Launcher.startServices()` 方法中集成 ProcessMonitor：

```typescript
await this.processMonitor.connect();
this.processMonitor.startMonitoring(SERVICE_START_ORDER);
this.processMonitor.onError((serviceName, error) => {
  this.logger.error(`Service ${serviceName} error: ${error.message}`);
});
```

### 3.4 相关文件

- `src/core/Launcher.ts`
- `src/modules/ProcessMonitor.ts`

***

## 4. GracefulShutdown 不工作

### 4.1 问题描述

按 Ctrl+C 时程序立即退出，不执行清理逻辑。

### 4.2 问题原因

`GracefulShutdown` 模块虽然实现了信号处理逻辑，但从未被集成到 Launcher 中。

### 4.3 解决方案

最初尝试将 GracefulShutdown 集成到 Launcher，但发现 `process.exit(0)` 会切断异步日志输出。

最终方案：移除 GracefulShutdown 模块，在 `main.ts` 中直接处理信号：

```typescript
const handleShutdown = (signal: string) => {
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGBREAK');
  
  console.log(`\nReceived ${signal}, shutting down...`);
  
  launcher.stop()
    .then(() => shutdownResolve())
    .catch((error) => {
      console.error('Error during shutdown:', error);
      shutdownResolve();
    });
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => handleShutdown('SIGBREAK'));
}
```

### 4.4 相关文件

- `src/main.ts`
- `src/core/Launcher.ts`

***

## 5. Windows 多信号处理问题

### 5.1 问题描述

在 Windows 上按一次 Ctrl+C，会触发多次关闭逻辑，导致：
- 多个 "Received SIGINT, shutting down..." 消息
- 多个 "Stopping DeerFlow..." 日志
- 多个 "Starting cleanup..." 日志
- PM2 连接状态混乱

### 5.2 问题原因

Windows 会在短时间内发送多个 SIGINT 信号。由于信号处理是同步的，多个信号可能在标志位设置之前就通过了检查。

### 5.3 尝试过的方案

1. **异步标志位** - 无效，因为多个信号在同一事件循环 tick 中到达
2. **setImmediate 延迟** - 无效，同样的问题
3. **同步标志位** - 无效，信号到达顺序问题

### 5.4 最终解决方案

收到第一个信号后立即移除所有信号监听器：

```typescript
const handleShutdown = (signal: string) => {
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGBREAK');
  
  console.log(`\nReceived ${signal}, shutting down...`);
  // ... 执行关闭逻辑
};
```

### 5.5 相关文件

- `src/main.ts`

***

## 6. PM2 操作挂起

### 6.1 问题描述

在 Windows 上，`PM2.stop()` 和 `PM2.delete()` 的回调有时不会触发，导致程序无限等待。

### 6.2 问题原因

PM2 的 Windows 实现存在一些边界情况，某些操作可能不会调用回调函数。

### 6.3 解决方案

使用 `Promise.race` 添加超时机制：

```typescript
async stopService(name: ServiceName): Promise<void> {
  const timeout = 10000;
  
  try {
    const stopPromise = new Promise<void>((resolve, reject) => {
      PM2.stop(name, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await Promise.race([
      stopPromise,
      new Promise<void>((_, reject) => 
        setTimeout(() => reject(new Error(`PM2.stop(${name}) timeout`)), timeout)
      )
    ]);
  } catch (error) {
    this.logger.warn(`${error.message}, forcing delete...`);
    
    await new Promise<void>((resolve) => {
      PM2.delete(name, () => resolve());
    });
  }
}
```

### 6.4 相关文件

- `src/modules/ProcessManager.ts`

***

## 7. Wrapper 进程关闭问题

### 7.1 问题描述

PM2 在 Windows 上使用 wrapper 进程包装非 Node.js 服务（如 nginx、langgraph）。关闭时 wrapper 进程可能不会正确终止子进程。

### 7.2 解决方案

在 `wrapper.js` 中实现优雅关闭：

```javascript
let isExiting = false;

function gracefulShutdown() {
  if (isExiting) return;
  isExiting = true;
  
  if (process.platform === 'win32') {
    proc.kill('SIGTERM');
    setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch (e) {}
      process.exit(0);
    }, 3000);
  } else {
    proc.kill('SIGTERM');
  }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGBREAK', gracefulShutdown);
```

### 7.3 相关文件

- `scripts/wrapper.js`

***

## 8. ConfigWatcher 集成

### 8.1 问题描述

ConfigWatcher 模块已实现但未集成到 Launcher 中。

### 8.2 解决方案

在 Launcher 中集成 ConfigWatcher：

```typescript
// 构造函数中创建实例
this.configWatcher = new ConfigWatcher(options.deerflowPath);

// 服务启动后开始监视
this.configWatcher.onChange((change: ConfigChange) => {
  this.logger.info(`Config file changed: ${change.file}`);
});
this.configWatcher.start();

// 清理时停止监视
this.configWatcher.stop();
```

### 8.3 监视的配置文件

- `config.yaml`
- `.env`
- `frontend/.env`
- `extensions_config.json`
- `nginx.conf`

### 8.4 相关文件

- `src/core/Launcher.ts`
- `src/modules/ConfigWatcher.ts`

***

## 9. CLI 参数解析问题

### 9.1 问题描述

执行 `npm run cli logs launcher --lines 10` 时，npm 警告并忽略 `--lines` 参数。

### 9.2 问题原因

npm 会尝试解析 `--lines` 作为自己的参数，而不是传递给脚本。

### 9.3 解决方案

使用 `--` 分隔 npm 参数和脚本参数：

```bash
npm run cli -- logs launcher --lines 10
npm run cli -- logs launcher --follow
```

### 9.4 相关文件

- `src/cli.ts`

***

## 10. 经验总结

### 10.1 Windows 平台特殊性

1. **进程管理差异** - Windows 上的进程管理（信号、进程树）与 Unix 不同
2. **PM2 wrapper** - PM2 在 Windows 上使用 wrapper 进程，需要特殊处理
3. **PowerShell** - 使用 PowerShell Core (`pwsh`) 进行系统级操作

### 10.2 异步编程注意事项

1. **信号处理** - 多个信号可能在同一时刻到达，需要同步处理
2. **回调超时** - 第三方库的回调可能不触发，需要超时保护
3. **日志输出** - `process.exit()` 会立即终止进程，确保异步操作完成

### 10.3 模块集成检查清单

- [ ] 模块是否被实例化？
- [ ] 启动方法是否被调用？
- [ ] 清理方法是否被调用？
- [ ] 错误处理是否完善？
- [ ] 日志是否正常输出？

***

## 11. 测试验证

### 11.1 单元测试

```bash
npm run test:unit
```

### 11.2 集成测试

```bash
npm run test:integration
```

### 11.3 手动测试清单

- [x] 启动所有服务成功
- [x] 查看状态显示正确（CPU/Memory 正确捕获）
- [x] 环境诊断通过
- [x] 日志查看正常
- [x] 实时日志跟踪正常
- [x] 优雅关闭成功（单次 Ctrl+C）
- [x] 服务崩溃自动恢复
- [x] 配置变更检测正常

***

*文档生成时间: 2026-03-30*
