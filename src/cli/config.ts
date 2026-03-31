import { homedir } from 'os';
import { join } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';

export interface CLIConfig {
  theme: 'default' | 'minimal' | 'verbose';
  colors: boolean;
  timestamps: boolean;
  confirmDestructive: boolean;
  autoStartServices: string[];
  defaultLogLines: number;
  deerflowPath?: string;
  logDirectory?: string;
}

export const DEFAULT_CONFIG: CLIConfig = {
  theme: 'default',
  colors: true,
  timestamps: true,
  confirmDestructive: true,
  autoStartServices: [],
  defaultLogLines: 50
};

export function getConfigPath(): string {
  return join(homedir(), '.deerflow', 'cli-config.json');
}

export async function loadConfig(): Promise<CLIConfig> {
  try {
    const data = await readFile(getConfigPath(), 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: Partial<CLIConfig>): Promise<void> {
  const current = await loadConfig();
  const merged = { ...current, ...config };
  
  await mkdir(join(homedir(), '.deerflow'), { recursive: true });
  await writeFile(getConfigPath(), JSON.stringify(merged, null, 2));
}

export interface CLIEnvironment {
  DEERFLOW_DEBUG?: string;
  DEERFLOW_LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
  DEERFLOW_PATH?: string;
  DEERFLOW_CONFIG?: string;
  DEERFLOW_NO_COLOR?: string;
  DEERFLOW_FORCE_TTY?: string;
  EDITOR?: string;
  SHELL?: string;
}

export function getEnv(): CLIEnvironment {
  return process.env as CLIEnvironment;
}

export function isDebug(): boolean {
  return getEnv().DEERFLOW_DEBUG === 'true' || 
         process.env.DEBUG?.includes('deerflow') === true;
}

export function isColorDisabled(): boolean {
  return getEnv().DEERFLOW_NO_COLOR === 'true' || !process.stdout.isTTY;
}
