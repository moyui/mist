import type { RealtimeSource } from '../realtime.types';

export function marketSeriesKey(
  securityId: number,
  source: RealtimeSource,
): string {
  return `${securityId}:${source}`;
}
