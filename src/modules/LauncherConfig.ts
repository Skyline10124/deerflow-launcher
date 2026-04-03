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
  paths: PathConfig[];
  defaultPath: string | null;
}

const DEFAULT_CONFIG: LauncherConfigData = {
  paths: [],
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
    const config = JSON.parse(content) as LauncherConfigData;
    
    if (!Array.isArray(config.paths)) {
      config.paths = [];
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
  
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    logger.debug(`Config saved to ${configPath}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to save config: ${msg}`);
    throw error;
  }
}

export function addPath(name: string, deerflowPath: string, description?: string): PathConfig {
  const config = loadConfig();
  
  const existing = config.paths.find(p => p.name === name);
  if (existing) {
    existing.path = deerflowPath;
    if (description) {
      existing.description = description;
    }
  } else {
    config.paths.push({ name, path: deerflowPath, description });
  }
  
  if (!config.defaultPath && config.paths.length === 1) {
    config.defaultPath = name;
  }
  
  saveConfig(config);
  
  return config.paths.find(p => p.name === name)!;
}

export function removePath(name: string): boolean {
  const config = loadConfig();
  const index = config.paths.findIndex(p => p.name === name);
  
  if (index === -1) {
    return false;
  }
  
  config.paths.splice(index, 1);
  
  if (config.defaultPath === name) {
    config.defaultPath = config.paths.length > 0 ? config.paths[0].name : null;
  }
  
  saveConfig(config);
  return true;
}

export function setDefaultPath(name: string): boolean {
  const config = loadConfig();
  
  const exists = config.paths.some(p => p.name === name);
  if (!exists) {
    return false;
  }
  
  config.defaultPath = name;
  saveConfig(config);
  return true;
}

export function getPath(name: string): PathConfig | undefined {
  const config = loadConfig();
  return config.paths.find(p => p.name === name);
}

export function getDefaultPath(): PathConfig | undefined {
  const config = loadConfig();
  if (!config.defaultPath) {
    return config.paths[0];
  }
  return config.paths.find(p => p.name === config.defaultPath);
}

export function listPaths(): PathConfig[] {
  const config = loadConfig();
  return config.paths;
}

export function clearConfig(): void {
  const configPath = getConfigFilePath();
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
}
