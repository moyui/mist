import { signalRealtimeModulesForMode } from './signal-app.module';

describe('signal realtime module assembly', () => {
  it('does not construct realtime infrastructure in off mode', () => {
    expect(signalRealtimeModulesForMode('off')).toEqual([]);
  });

  it.each(['shadow', 'on'] as const)(
    'fails bootstrap before listeners for incomplete %s assembly',
    (mode) => {
      expect(() => signalRealtimeModulesForMode(mode)).toThrow(
        'is unavailable until the Signal realtime module is assembled',
      );
    },
  );
});
