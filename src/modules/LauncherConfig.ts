import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getLogger } from './Logger.js';

const logger = getLogger('LauncherConfig');

export interface PathConfig {
  name: string;
  path: string;
  description?: string;
}

export interface LauncherConfigData {
  deerflowPaths: PathConfig[];
  defaultPath: string | null;
}

const DEFAULT_CONFIG: LauncherConfigData = {
  deerflowPaths: [],
  defaultPath: null,
};

function getConfigDir(): string {
  return path.join(os.homedir(), '.deerflow');
}

function getConfigFilePath(): string {
  return path.join(getConfigDir(), 'launcher.json');
}

function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

export function loadConfig(): LauncherConfigData {
  const configPath = getConfigFilePath();
  
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const rawConfig = JSON.parse(content) as Record<string, unknown>;
    
    const config: LauncherConfigData = {
      deerflowPaths: [],
      defaultPath: null,
    };
    
    if (Array.isArray(rawConfig.deerflowPaths)) {
      config.deerflowPaths = rawConfig.deerflowPaths as PathConfig[];
    } else if (Array.isArray(rawConfig.paths)) {
      config.deerflowPaths = rawConfig.paths as PathConfig[];
    }
    
    if (typeof rawConfig.defaultPath === 'string') {
      config.defaultPath = rawConfig.defaultPath;
    }
    
    return config;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to load config: ${msg}`);
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: LauncherConfigData): void {
  ensureConfigDir();
  const configPath = getConfigFilePath();
  
  const cleanConfig: LauncherConfigData = {
    deerflowPaths: config.deerflowPaths,
    defaultPath: config.defaultPath,
  };
  
  try {
    fs.writeFileSync(configPath, JSON.stringify(cleanConfig, null, 2), 'utf-8');
    logger.debug(`Config saved to ${configPath}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to save config: ${msg}`);
    throw error;
  }
}

export function getDeerflowPaths(): PathConfig[] {
  const config = loadConfig();
  return config.deerflowPaths;
}

export function getDeerflowPath(name: string): PathConfig | undefined {
  const config = loadConfig();
  return config.deerflowPaths.find(p => p.name === name);
}

export function getDefaultDeerflowPath(): PathConfig | undefined {
  const config = loadConfig();
  if (!config.defaultPath) {
    return config.deerflowPaths[0];
  }
  return config.deerflowPaths.find(p => p.name === config.defaultPath);
}

export function setDeerflowPath(name: string, deerflowPath: string, description?: string): PathConfig {
  const config = loadConfig();
  
  const existing = config.deerflowPaths.find(p => p.name === name);
  if (existing) {
    existing.path = deerflowPath;
    if (description !== undefined) {
      existing.description = description;
    }
  } else {
    config.deerflowPaths.push({ name, path: deerflowPath, description });
  }
  
  if (!config.defaultPath && config.deerflowPaths.length === 1) {
    config.defaultPath = name;
  }
  
  saveConfig(config);
  
  const added = config.deerflowPaths.find(p => p.name === name);
  if (!added) {
    throw new Error(`Failed to add path "${name}"`);
  }
  return added;
}

export function removeDeerflowPath(name: string): boolean {
  const config = loadConfig();
  const index = config.deerflowPaths.findIndex(p => p.name === name);
  
  if (index === -1) {
    return false;
  }
  
  config.deerflowPaths.splice(index, 1);
  
  if (config.defaultPath === name) {
    config.defaultPath = config.deerflowPaths.length > 0 ? config.deerflowPaths[0].name : null;
  }
  
  saveConfig(config);
  return true;
}

export function setDefaultPath(name: string): boolean {
  const config = loadConfig();
  
  const exists = config.deerflowPaths.some(p => p.name === name);
  if (!exists) {
    return false;
  }
  
  config.defaultPath = name;
  saveConfig(config);
  return true;
}

export function getDefaultPath(): string | null {
  const config = loadConfig();
  return config.defaultPath;
}

export function clearConfig(): void {
  const configPath = getConfigFilePath();
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
}

export function getConfigPath(): string {
  return getConfigFilePath();
}
