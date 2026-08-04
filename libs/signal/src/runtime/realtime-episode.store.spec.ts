import { RealtimeEpisodeStore } from './realtime-episode.store';

describe('RealtimeEpisodeStore registry cleanup', () => {
  const identity = {
    definitionId: 1,
    versionId: 2,
    securityId: 9,
    source: 'tdx',
    period: 1,
    signalKind: 'entry',
  } as const;

  it('removes active membership that becomes unreachable', () => {
    const store = new RealtimeEpisodeStore();
    store.activate(identity);
    expect(store.activeCount).toBe(1);

    store.retainIdentities([]);

    expect(store.activeCount).toBe(0);
  });

  it('preserves membership that remains in the compiled universe', () => {
    const store = new RealtimeEpisodeStore();
    store.activate(identity);
    store.retainIdentities([identity]);
    expect(store.activeCount).toBe(1);
  });
});
