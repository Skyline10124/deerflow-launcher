import * as net from 'net';
import { HealthChecker } from '../../src/modules/HealthChecker';
import { test, expect, beforeEach, afterEach, describe } from 'bun:test';

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;
  let testServer: net.Server | null = null;
  const testPort = 19999;

  beforeEach(() => {
    healthChecker = new HealthChecker();
  });

  afterEach(() => {
    return new Promise<void>((resolve) => {
      if (testServer) {
        testServer.close(() => {
          testServer = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  });

  const createTestServer = (port: number): Promise<net.Server> => {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(port, () => {
        testServer = server;
        resolve(server);
      });
      server.on('error', reject);
    });
  };

  test('should detect healthy port', async () => {
    await createTestServer(testPort);

    const result = await healthChecker.check({
      host: 'localhost',
      port: testPort,
      timeout: 5000,
      interval: 100
    });

    expect(result.status).toBe('healthy');
    expect(result.port).toBe(testPort);
    expect(result.duration).toBeGreaterThan(0);
  });

  test('should return timeout for unavailable port', async () => {
    const result = await healthChecker.check({
      host: 'localhost',
      port: 19998,
      timeout: 1000,
      interval: 100
    });

    expect(result.status).toBe('timeout');
    expect(result.error).toBeDefined();
  });

  test('should check multiple ports', async () => {
    await createTestServer(testPort);

    const results = await healthChecker.checkMultiple(
      [testPort, 19998],
      { host: 'localhost', timeout: 1000, interval: 100 }
    );

    expect(results.size).toBe(2);
    expect(results.get(testPort)?.status).toBe('healthy');
    expect(results.get(19998)?.status).toBe('timeout');
  });
});
