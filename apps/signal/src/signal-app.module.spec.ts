import { signalRealtimeModulesForMode } from './signal-app.module';

describe('signal realtime module assembly', () => {
  it('does not construct realtime infrastructure in off mode', () => {
    expect(signalRealtimeModulesForMode('off')).toEqual([]);
  });

  it('assembles the single realtime module in shadow mode', () => {
    expect(signalRealtimeModulesForMode('shadow')).toHaveLength(1);
  });

  it('assembles the persistence-capable realtime module in on mode', () => {
    expect(signalRealtimeModulesForMode('on')).toHaveLength(1);
  });
});
