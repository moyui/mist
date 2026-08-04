import { signalRealtimeModulesForMode } from './signal-app.module';

describe('signal realtime module assembly', () => {
  it('does not construct realtime infrastructure in off mode', () => {
    expect(signalRealtimeModulesForMode('off')).toEqual([]);
  });

  it.each(['shadow', 'on'] as const)(
    'assembles the single realtime module in %s mode',
    (mode) => {
      expect(signalRealtimeModulesForMode(mode)).toHaveLength(1);
    },
  );
});
