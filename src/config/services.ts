import * as path from 'path';
import { ServiceDefinition, ServiceName } from '../types';

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value) {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }
  return defaultValue;
}

export const SERVICE_PORTS: Record<ServiceName, number> = {
  [ServiceName.LANGGRAPH]: getEnvInt('LANGGRAPH_PORT', 2024),
  [ServiceName.GATEWAY]: getEnvInt('GATEWAY_PORT', 8001),
  [ServiceName.FRONTEND]: getEnvInt('FRONTEND_PORT', 3000),
  [ServiceName.NGINX]: getEnvInt('NGINX_PORT', 2026)
};

export const SERVICE_TIMEOUTS: Record<ServiceName, number> = {
  [ServiceName.LANGGRAPH]: getEnvInt('LANGGRAPH_TIMEOUT', 60000),
  [ServiceName.GATEWAY]: getEnvInt('GATEWAY_TIMEOUT', 30000),
  [ServiceName.FRONTEND]: getEnvInt('FRONTEND_TIMEOUT', 120000),
  [ServiceName.NGINX]: getEnvInt('NGINX_TIMEOUT', 10000)
};

export interface ServiceOptions {
  langsmith?: boolean;
}

function getPnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

export function getServiceDefinitions(deerflowPath: string, options?: ServiceOptions): ServiceDefinition[] {
  const langgraphArgs = ['run', 'langgraph', 'dev', '--port', String(SERVICE_PORTS[ServiceName.LANGGRAPH])];
  
  if (!options?.langsmith) {
    langgraphArgs.push('--no-browser');
  }
  
  const langsmithEnv: Record<string, string> = {};
  if (options?.langsmith) {
    langsmithEnv.LANGSMITH_TRACING = 'true';
  } else {
    langsmithEnv.LANGSMITH_TRACING = 'false';
  }

  return [
    {
      name: ServiceName.LANGGRAPH,
      script: 'uv',
      args: langgraphArgs,
      cwd: path.join(deerflowPath, 'backend'),
      port: SERVICE_PORTS[ServiceName.LANGGRAPH],
      timeout: SERVICE_TIMEOUTS[ServiceName.LANGGRAPH],
      dependencies: [],
      env: langsmithEnv
    },
    {
      name: ServiceName.GATEWAY,
      script: 'uv',
      args: ['run', 'uvicorn', 'app.gateway.app:create_app', '--factory', '--host', '0.0.0.0', '--port', String(SERVICE_PORTS[ServiceName.GATEWAY])],
      cwd: path.join(deerflowPath, 'backend'),
      port: SERVICE_PORTS[ServiceName.GATEWAY],
      timeout: SERVICE_TIMEOUTS[ServiceName.GATEWAY],
      dependencies: [ServiceName.LANGGRAPH],
      env: langsmithEnv
    },
    {
      name: ServiceName.FRONTEND,
      script: getPnpmCommand(),
      args: ['dev'],
      cwd: path.join(deerflowPath, 'frontend'),
      port: SERVICE_PORTS[ServiceName.FRONTEND],
      timeout: SERVICE_TIMEOUTS[ServiceName.FRONTEND],
      dependencies: [ServiceName.GATEWAY],
      env: {
        PORT: String(SERVICE_PORTS[ServiceName.FRONTEND])
      }
    },
    {
      name: ServiceName.NGINX,
      script: 'nginx',
      args: ['-c', path.join(deerflowPath, 'nginx.conf')],
      cwd: deerflowPath,
      port: SERVICE_PORTS[ServiceName.NGINX],
      timeout: SERVICE_TIMEOUTS[ServiceName.NGINX],
      dependencies: [ServiceName.FRONTEND]
    }
  ];
}

export const SERVICE_START_ORDER: ServiceName[] = [
  ServiceName.LANGGRAPH,
  ServiceName.GATEWAY,
  ServiceName.FRONTEND,
  ServiceName.NGINX
];
