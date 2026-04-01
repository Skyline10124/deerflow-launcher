import * as net from 'net';
import { Logger, getLogger } from './Logger';
import { HealthCheckOptions, HealthCheckResult } from '../types';

export class HealthChecker {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('HealthCheck');
  }

  async check(options: HealthCheckOptions): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const { host = 'localhost', port, timeout, interval = 1000 } = options;

    this.logger.debug(`Starting health check for port ${port}`);

    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      try {
        const connected = await this.tryConnect(host, port);
        if (connected) {
          const duration = Date.now() - startTime;
          this.logger.success(`${this.formatPort(port)} is healthy (${duration}ms)`);
          return {
            status: 'healthy',
            port,
            duration
          };
        }
      } catch (_error) {
        this.logger.debug(`Connection attempt failed for port ${port}`);
      }

      const remaining = deadline - Date.now();
      if (remaining > interval) {
        await this.sleep(interval);
      }
    }

    const duration = Date.now() - startTime;
    this.logger.warn(`${this.formatPort(port)} health check failed: timeout after ${duration}ms`);
    return {
      status: 'timeout',
      port,
      duration,
      error: `Connection timeout after ${timeout}ms`
    };
  }

  private tryConnect(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 2000;

      socket.setTimeout(timeout);

      const cleanup = () => {
        socket.removeAllListeners();
        socket.destroy();
      };

      socket.once('connect', () => {
        cleanup();
        resolve(true);
      });

      socket.once('timeout', () => {
        cleanup();
        resolve(false);
      });

      socket.once('error', () => {
        cleanup();
        resolve(false);
      });

      socket.once('close', () => {
        cleanup();
        resolve(false);
      });

      try {
        socket.connect(port, host);
      } catch {
        cleanup();
        resolve(false);
      }
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private formatPort(port: number): string {
    const serviceNames: Record<number, string> = {
      2024: 'LangGraph',
      8001: 'Gateway',
      3000: 'Frontend',
      2026: 'Nginx'
    };
    const name = serviceNames[port] || 'Unknown';
    return `${name} (port ${port})`;
  }

  async checkMultiple(
    ports: number[],
    options: Omit<HealthCheckOptions, 'port'>
  ): Promise<Map<number, HealthCheckResult>> {
    const results = new Map<number, HealthCheckResult>();

    for (const port of ports) {
      const result = await this.check({ ...options, port });
      results.set(port, result);
    }

    return results;
  }
}
