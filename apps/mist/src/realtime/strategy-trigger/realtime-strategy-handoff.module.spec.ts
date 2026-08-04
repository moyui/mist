import { realtimeStrategyHandoffModulesForMode } from '../realtime-ingress.module';

describe('realtime strategy handoff module selection', () => {
  it('does not construct BullMQ producer resources in off mode', () => {
    expect(realtimeStrategyHandoffModulesForMode('off')).toEqual([]);
  });

  it.each(['shadow', 'on'] as const)(
    'constructs one producer module in %s mode',
    (mode) =>
      expect(realtimeStrategyHandoffModulesForMode(mode)).toHaveLength(1),
  );
});
