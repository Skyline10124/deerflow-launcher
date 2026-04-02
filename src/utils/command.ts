import { spawnSync, SpawnSyncReturns } from 'child_process';

/** 将命令字符串拆分为可执行文件和参数，去除 shell 重定向 */
export function splitCommand(command: string): { executable: string; args: string[] } {
  const cleaned = command.replace(/\d*>&\d+/g, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return { executable: parts[0], args: parts.slice(1) };
}

/** 安全执行命令，不使用 shell: true */
export function safeSpawnSync(
  command: string,
  options?: { timeout?: number }
): SpawnSyncReturns<string> {
  const { executable, args } = splitCommand(command);
  return spawnSync(executable, args, {
    encoding: 'utf-8',
    timeout: options?.timeout ?? 5000,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}
