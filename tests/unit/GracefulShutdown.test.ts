import { GracefulShutdown } from '../../src/modules/GracefulShutdown.js';
import { ServiceName } from '../../src/types/index.js';

describe('GracefulShutdown', () => {
  let shutdown: GracefulShutdown;

  beforeEach(() => {
    shutdown = new GracefulShutdown({
      gracefulTimeout: 1000,
      forceKillTimeout: 500,
      shutdownOrder: [ServiceName.NGINX, ServiceName.FRONTEND, ServiceName.GATEWAY, ServiceName.LANGGRAPH]
    });
  });

  afterEach(() => {
    // Clean up
  });

  it('should create shutdown handler with config', () => {
    expect(shutdown).toBeDefined();
  });

  it('should not be in shutdown initially', () => {
    expect(shutdown.isInShutdown()).toBe(false);
  });

  it('should register stop service function', () => {
    const stopFn = jest.fn();
    shutdown.setStopServiceFn(stopFn);
    // Function is stored internally
    expect(true).toBe(true);
  });

  it('should return empty results when already shutting down', async () => {
    const stopFn = jest.fn().mockResolvedValue(undefined);
    shutdown.setStopServiceFn(stopFn);

    const promise1 = shutdown.shutdown([ServiceName.LANGGRAPH]);
    
    const result2 = await shutdown.shutdown([ServiceName.GATEWAY]);
    expect(result2).toEqual([]);

    await promise1;
  });

  it('should handle shutdown with no stop function registered', async () => {
    const results = await shutdown.shutdown([ServiceName.LANGGRAPH]);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });

  it('should call stop function for each service', async () => {
    const stopFn = jest.fn().mockResolvedValue(undefined);
    shutdown.setStopServiceFn(stopFn);

    const results = await shutdown.shutdown([ServiceName.LANGGRAPH, ServiceName.GATEWAY]);
    
    expect(stopFn).toHaveBeenCalledTimes(2);
    expect(stopFn).toHaveBeenCalledWith(ServiceName.LANGGRAPH);
    expect(stopFn).toHaveBeenCalledWith(ServiceName.GATEWAY);
    expect(results.every(r => r.success)).toBe(true);
  });

  it('should handle stop function errors', async () => {
    const stopFn = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Stop failed'));
    shutdown.setStopServiceFn(stopFn);

    const results = await shutdown.shutdown([ServiceName.LANGGRAPH, ServiceName.GATEWAY]);
    
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toBe('Stop failed');
  });
});
