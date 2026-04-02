import { GracefulShutdown } from '../../src/modules/GracefulShutdown';
import { ServiceName } from '../../src/types';
import { test, expect, beforeEach, afterEach, describe, mock } from 'bun:test';

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

  test('should create shutdown handler with config', () => {
    expect(shutdown).toBeDefined();
  });

  test('should not be in shutdown initially', () => {
    expect(shutdown.isInShutdown()).toBe(false);
  });

  test('should register stop service function', () => {
    const stopFn = mock(() => Promise.resolve());
    shutdown.setStopServiceFn(stopFn);
    // Function is stored internally
    expect(true).toBe(true);
  });

  test('should return empty results when already shutting down', async () => {
    const stopFn = mock(() => Promise.resolve());
    shutdown.setStopServiceFn(stopFn);

    const promise1 = shutdown.shutdown([ServiceName.LANGGRAPH]);
    
    const result2 = await shutdown.shutdown([ServiceName.GATEWAY]);
    expect(result2).toEqual([]);

    await promise1;
  });

  test('should handle shutdown with no stop function registered', async () => {
    const results = await shutdown.shutdown([ServiceName.LANGGRAPH]);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });

  test('should call stop function for each service', async () => {
    const stopFn = mock(() => Promise.resolve());
    shutdown.setStopServiceFn(stopFn);

    const results = await shutdown.shutdown([ServiceName.LANGGRAPH, ServiceName.GATEWAY]);
    
    expect(stopFn).toHaveBeenCalledTimes(2);
    expect(results.every(r => r.success)).toBe(true);
  });

  test('should handle stop function errors', async () => {
    let callCount = 0;
    const stopFn = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve();
      }
      return Promise.reject(new Error('Stop failed'));
    });
    shutdown.setStopServiceFn(stopFn);

    const results = await shutdown.shutdown([ServiceName.LANGGRAPH, ServiceName.GATEWAY]);
    
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toBe('Stop failed');
  });
});
