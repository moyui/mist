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

  it('emits, suppresses, clears and leaves unavailable membership unchanged', () => {
    const store = new RealtimeEpisodeStore();
    expect(store.decide(identity, { status: 'evaluated', matched: true })).toBe(
      'emit',
    );
    expect(store.activeCount).toBe(0);
    store.activate(identity);
    expect(store.decide(identity, { status: 'evaluated', matched: true })).toBe(
      'suppress',
    );
    expect(store.decide(identity, { status: 'unavailable' })).toBe('no-op');
    expect(store.activeCount).toBe(1);
    expect(
      store.decide(identity, { status: 'evaluated', matched: false }),
    ).toBe('clear');
    expect(store.activeCount).toBe(0);
  });

  it('keeps source and immutable version in separate memberships', () => {
    const store = new RealtimeEpisodeStore();
    store.activate(identity);
    expect(
      store.decide(
        { ...identity, source: 'qmt' },
        { status: 'evaluated', matched: true },
      ),
    ).toBe('emit');
    expect(
      store.decide(
        { ...identity, versionId: 3 },
        { status: 'evaluated', matched: true },
      ),
    ).toBe('emit');
  });

  it('clears the process-local active set on reset', () => {
    const store = new RealtimeEpisodeStore();
    store.activate(identity);
    store.reset();
    expect(store.activeCount).toBe(0);
    expect(store.decide(identity, { status: 'evaluated', matched: true })).toBe(
      'emit',
    );
  });
});
