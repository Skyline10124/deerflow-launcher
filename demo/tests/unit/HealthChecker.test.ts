import * as net from 'net';
import { HealthChecker } from '../../src/modules/HealthChecker';

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;
  let testServer: net.Server;
  const testPort = 19999;

  beforeEach(() => {
    healthChecker = new HealthChecker();
  });

  afterEach((done) => {
    if (testServer) {
      testServer.close(() => done());
    } else {
      done();
    }
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

  it('should detect healthy port', async () => {
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

  it('should return timeout for unavailable port', async () => {
    const result = await healthChecker.check({
      host: 'localhost',
      port: 19998,
      timeout: 1000,
      interval: 100
    });

    expect(result.status).toBe('timeout');
    expect(result.error).toBeDefined();
  });

  it('should check multiple ports', async () => {
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
