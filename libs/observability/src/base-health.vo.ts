export type HealthStatus = 'ok' | 'degraded' | 'error';

export interface BaseHealthVo {
  readonly status: HealthStatus;
  readonly service: string;
  readonly instance: string;
  readonly timestamp: string;
  readonly version?: string;
}

export function createBaseHealthSnapshot(
  service: string,
  status: HealthStatus = 'ok',
  instance?: string,
): BaseHealthVo {
  return {
    status,
    service,
    instance: instance ?? service,
    timestamp: new Date().toISOString(),
  };
}
