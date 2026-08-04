import { DataSource } from '@app/shared-data';
import { RealtimeSubscriptionLifecycleObservationStore } from './realtime-subscription-lifecycle-observation.store';

describe('RealtimeSubscriptionLifecycleObservationStore', () => {
  it('keeps rollback mode explicitly unknown', () => {
    const store = new RealtimeSubscriptionLifecycleObservationStore();
    store.replaceActive(DataSource.TDX, ['600030.SH']);

    expect(store.project(DataSource.TDX, '600030.SH', true, false)).toEqual({
      active: null,
      activeEvidence: null,
      convergence: 'unknown',
      convergenceReason: 'lifecycle_disabled',
      deferredRemovalReason: null,
    });
  });

  it('maps TDX fresh native membership and deferred removal exactly', () => {
    const store = new RealtimeSubscriptionLifecycleObservationStore();
    store.replaceActive(DataSource.TDX, ['600030.SH']);
    store.succeed(DataSource.TDX);

    expect(store.project(DataSource.TDX, '600030.SH', true, true)).toEqual({
      active: true,
      activeEvidence: 'tdx_native_list',
      convergence: 'converged',
      convergenceReason: null,
      deferredRemovalReason: null,
    });
    expect(store.project(DataSource.TDX, '600030.SH', false, true)).toEqual({
      active: true,
      activeEvidence: 'tdx_native_list',
      convergence: 'drifted',
      convergenceReason: 'awaiting_full_reset',
      deferredRemovalReason: 'awaiting_full_reset',
    });
  });

  it('maps QMT registry absence without claiming provider-native evidence', () => {
    const store = new RealtimeSubscriptionLifecycleObservationStore();
    store.replaceActive(DataSource.QMT, []);
    store.succeed(DataSource.QMT);

    expect(store.project(DataSource.QMT, '300502.SZ', true, true)).toEqual({
      active: false,
      activeEvidence: 'qmt_durable_registry',
      convergence: 'drifted',
      convergenceReason: 'desired_missing_active',
      deferredRemovalReason: null,
    });
  });

  it('preserves the last proven value while a round is pending', () => {
    const store = new RealtimeSubscriptionLifecycleObservationStore();
    store.replaceActive(DataSource.TDX, ['600030.SH']);
    store.begin(DataSource.TDX, 'weekday_0915');

    expect(store.project(DataSource.TDX, '600030.SH', false, true)).toEqual({
      active: true,
      activeEvidence: 'tdx_native_list',
      convergence: 'pending',
      convergenceReason: 'awaiting_full_reset',
      deferredRemovalReason: 'awaiting_full_reset',
    });
  });

  it('marks disconnect stale and QMT recovery failures blocked', () => {
    const store = new RealtimeSubscriptionLifecycleObservationStore();
    store.replaceActive(DataSource.TDX, ['600030.SH']);
    store.disconnect(DataSource.TDX);
    expect(
      store.project(DataSource.TDX, '600030.SH', true, true),
    ).toMatchObject({
      active: null,
      activeEvidence: null,
      convergence: 'unknown',
      convergenceReason: 'readback_stale',
    });

    store.fail(DataSource.QMT, 'QMT_RECONCILIATION_REQUIRED');
    expect(
      store.project(DataSource.QMT, '300502.SZ', true, true),
    ).toMatchObject({
      convergence: 'blocked',
      convergenceReason: 'qmt_reconciliation_required',
    });
  });

  it('reports identity-free source counts and bounded attempt ages', () => {
    const store = new RealtimeSubscriptionLifecycleObservationStore();
    store.begin(
      DataSource.TDX,
      'accepted_ready',
      new Date('2026-08-04T01:00:00Z'),
    );
    store.setDesired(DataSource.TDX, ['300502.SZ', '600030.SH']);
    store.replaceActive(DataSource.TDX, ['600030.SH', '000001.SZ']);
    store.succeed(DataSource.TDX, new Date('2026-08-04T01:00:02Z'));

    expect(
      store.health('on', new Date('2026-08-04T01:00:05Z')).sources[0],
    ).toEqual({
      source: DataSource.TDX,
      desiredCount: 2,
      activeCount: 2,
      convergedCount: 1,
      deferredRemovalCount: 1,
      activeEvidence: 'tdx_native_list',
      convergence: 'drifted',
      trigger: 'accepted_ready',
      result: 'success',
      reason: 'desired_missing_active',
      lastAttemptAt: '2026-08-04T01:00:00.000Z',
      lastAttemptAgeSeconds: 5,
      lastSuccessAt: '2026-08-04T01:00:02.000Z',
      lastSuccessAgeSeconds: 3,
      triggerTotals: [{ trigger: 'accepted_ready', value: 1 }],
      resultTotals: [
        {
          trigger: 'accepted_ready',
          result: 'success',
          reason: 'none',
          value: 1,
        },
      ],
    });
  });

  it('preserves unknown counts before authoritative desired and active reads', () => {
    const store = new RealtimeSubscriptionLifecycleObservationStore();

    expect(store.health('on').sources[0]).toMatchObject({
      desiredCount: null,
      activeCount: null,
      convergedCount: null,
      deferredRemovalCount: null,
      convergence: 'unknown',
      reason: 'transport_not_ready',
    });

    store.setDesired(DataSource.TDX, ['600030.SH']);
    expect(store.health('on').sources[0]).toMatchObject({
      desiredCount: 1,
      activeCount: null,
      convergedCount: null,
      deferredRemovalCount: null,
    });
  });
});
