import * as net from 'net';
import { Logger, getLogger } from './Logger.js';
import { HealthCheckOptions, HealthCheckResult } from '../types/index.js';

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
      const timeout = 2000;
      
      const socket = net.connect({
        port: port,
        host: host,
        family: 4
      }, () => {
        socket.destroy();
        resolve(true);
      });

      socket.setTimeout(timeout);

      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
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

    const checks = ports.map(async (port) => {
      const result = await this.check({ ...options, port });
      return { port, result };
    });

    const settled = await Promise.allSettled(checks);
    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      if (outcome.status === 'fulfilled') {
        results.set(outcome.value.port, outcome.value.result);
      } else {
        results.set(ports[i], {
          status: 'error' as const,
          port: ports[i],
          duration: 0,
          error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
        });
      }
    }

    return results;
  }
}
