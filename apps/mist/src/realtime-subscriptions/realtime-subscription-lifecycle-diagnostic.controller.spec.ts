import { ConfigService } from '@nestjs/config';
import { RealtimeSubscriptionLifecycleDiagnosticController } from './realtime-subscription-lifecycle-diagnostic.controller';

describe('RealtimeSubscriptionLifecycleDiagnosticController', () => {
  it('returns the low-cardinality lifecycle health view', () => {
    const value = { mode: 'on', sources: [] };
    const observations = { health: jest.fn().mockReturnValue(value) };
    const now = new Date('2026-08-04T01:00:00Z');
    const controller = new RealtimeSubscriptionLifecycleDiagnosticController(
      observations as never,
      new ConfigService({ REALTIME_SUBSCRIPTION_LIFECYCLE_MODE: 'on' }),
      { nowDate: () => now } as never,
    );

    expect(controller.getStatus()).toBe(value);
    expect(observations.health).toHaveBeenCalledWith('on', now);
  });
});
