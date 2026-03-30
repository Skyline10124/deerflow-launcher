import * as path from 'path';
import { ServiceDefinition, ServiceName } from '../types';

export function getServiceDefinitions(deerflowPath: string): ServiceDefinition[] {
  return [
    {
      name: ServiceName.LANGGRAPH,
      script: 'uv',
      args: ['run', 'langgraph', 'dev', '--port', '2024'],
      cwd: path.join(deerflowPath, 'backend'),
      port: 2024,
      timeout: 60000,
      dependencies: []
    },
    {
      name: ServiceName.GATEWAY,
      script: 'uv',
      args: ['run', 'uvicorn', 'app.gateway.app:create_app', '--factory', '--host', '0.0.0.0', '--port', '8001'],
      cwd: path.join(deerflowPath, 'backend'),
      port: 8001,
      timeout: 30000,
      dependencies: [ServiceName.LANGGRAPH]
    },
    {
      name: ServiceName.FRONTEND,
      script: 'pnpm',
      args: ['dev'],
      cwd: path.join(deerflowPath, 'frontend'),
      port: 3000,
      timeout: 120000,
      dependencies: [ServiceName.GATEWAY],
      env: {
        PORT: '3000'
      }
    },
    {
      name: ServiceName.NGINX,
      script: process.platform === 'win32' ? 'nginx' : 'nginx',
      args: process.platform === 'win32' 
        ? ['-c', path.join(deerflowPath, 'nginx.conf')]
        : ['-c', path.join(deerflowPath, 'nginx.conf')],
      cwd: deerflowPath,
      port: 2026,
      timeout: 10000,
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

export const SERVICE_PORTS: Record<ServiceName, number> = {
  [ServiceName.LANGGRAPH]: 2024,
  [ServiceName.GATEWAY]: 8001,
  [ServiceName.FRONTEND]: 3000,
  [ServiceName.NGINX]: 2026
};

export const SERVICE_TIMEOUTS: Record<ServiceName, number> = {
  [ServiceName.LANGGRAPH]: 60000,
  [ServiceName.GATEWAY]: 30000,
  [ServiceName.FRONTEND]: 120000,
  [ServiceName.NGINX]: 10000
};
