import { signalRealtimeModulesForMode } from './signal-app.module';

describe('signal realtime module assembly', () => {
  it('does not construct realtime infrastructure in off mode', () => {
    expect(signalRealtimeModulesForMode('off')).toEqual([]);
  });

  it('assembles the single realtime module in shadow mode', () => {
    expect(signalRealtimeModulesForMode('shadow')).toHaveLength(1);
  });

  it('fails bootstrap before on can silently behave like shadow', () => {
    expect(() => signalRealtimeModulesForMode('on')).toThrow(
      'live persistence is assembled',
    );
  });
});
