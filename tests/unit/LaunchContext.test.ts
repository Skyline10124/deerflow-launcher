import {
  createLaunchContext,
  updateServiceStatus,
  getServiceInstance,
  getAllServices,
  getHealthyServices,
  getFailedServices,
  setLaunchStatus,
  formatDuration
} from '../../src/core/LaunchContext.js';
import { ServiceName, ServiceStatus, LaunchStatus } from '../../src/types/index.js';

describe('LaunchContext', () => {
  const testPath = '/test/deerflow';
  const testLogDir = '/test/logs';

  it('should create launch context with all services', () => {
    const context = createLaunchContext(testPath, testLogDir);

    expect(context.status).toBe(LaunchStatus.IDLE);
    expect(context.deerflowPath).toBe(testPath);
    expect(context.logDir).toBe(testLogDir);
    expect(context.services.size).toBe(4);
    expect(context.services.has(ServiceName.LANGGRAPH)).toBe(true);
    expect(context.services.has(ServiceName.GATEWAY)).toBe(true);
    expect(context.services.has(ServiceName.FRONTEND)).toBe(true);
    expect(context.services.has(ServiceName.NGINX)).toBe(true);
  });

  it('should update service status', () => {
    const context = createLaunchContext(testPath, testLogDir);

    updateServiceStatus(context, ServiceName.LANGGRAPH, ServiceStatus.HEALTHY, {
      pid: 1234,
      healthCheckDuration: 5000
    });

    const service = getServiceInstance(context, ServiceName.LANGGRAPH);
    expect(service?.status).toBe(ServiceStatus.HEALTHY);
    expect(service?.pid).toBe(1234);
    expect(service?.healthCheckDuration).toBe(5000);
  });

  it('should get all services', () => {
    const context = createLaunchContext(testPath, testLogDir);
    const services = getAllServices(context);

    expect(services.length).toBe(4);
    expect(services.map((s) => s.name)).toContain(ServiceName.LANGGRAPH);
    expect(services.map((s) => s.name)).toContain(ServiceName.GATEWAY);
    expect(services.map((s) => s.name)).toContain(ServiceName.FRONTEND);
    expect(services.map((s) => s.name)).toContain(ServiceName.NGINX);
  });

  it('should filter healthy services', () => {
    const context = createLaunchContext(testPath, testLogDir);

    updateServiceStatus(context, ServiceName.LANGGRAPH, ServiceStatus.HEALTHY);
    updateServiceStatus(context, ServiceName.GATEWAY, ServiceStatus.HEALTHY);
    updateServiceStatus(context, ServiceName.FRONTEND, ServiceStatus.STARTING);

    const healthy = getHealthyServices(context);
    expect(healthy.length).toBe(2);
    expect(healthy.map((s) => s.name)).toContain(ServiceName.LANGGRAPH);
    expect(healthy.map((s) => s.name)).toContain(ServiceName.GATEWAY);
  });

  it('should filter failed services', () => {
    const context = createLaunchContext(testPath, testLogDir);

    updateServiceStatus(context, ServiceName.LANGGRAPH, ServiceStatus.HEALTHY);
    updateServiceStatus(context, ServiceName.GATEWAY, ServiceStatus.FAILED, {
      error: 'Test error'
    });

    const failed = getFailedServices(context);
    expect(failed.length).toBe(1);
    expect(failed[0].name).toBe(ServiceName.GATEWAY);
    expect(failed[0].error).toBe('Test error');
  });

  it('should set launch status', () => {
    const context = createLaunchContext(testPath, testLogDir);

    setLaunchStatus(context, LaunchStatus.CHECKING_ENV);
    expect(context.status).toBe(LaunchStatus.CHECKING_ENV);

    setLaunchStatus(context, LaunchStatus.STARTING_SERVICES);
    expect(context.status).toBe(LaunchStatus.STARTING_SERVICES);
  });

  it('should format duration correctly', () => {
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(125)).toBe('2m 5s');
  });
});
