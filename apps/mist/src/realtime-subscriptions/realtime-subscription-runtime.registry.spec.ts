import { DataSource } from '@app/shared-data';
import { RealtimeSubscriptionControl } from '../realtime/realtime-subscription-control';
import { RealtimeSubscriptionRuntimeRegistry } from './realtime-subscription-runtime.registry';

describe('RealtimeSubscriptionRuntimeRegistry', () => {
  it('publishes one accepted-ready observation per connection identity', () => {
    const registry = new RealtimeSubscriptionRuntimeRegistry();
    const listener = jest.fn();
    const control = buildControl();
    registry.registerControl(DataSource.TDX, control);
    registry.subscribeReady(listener);

    registry.observeAcceptedReady(
      DataSource.TDX,
      1,
      new Date('2026-08-04T01:00:00Z'),
    );
    registry.observeAcceptedReady(
      DataSource.TDX,
      1,
      new Date('2026-08-04T01:00:01Z'),
    );
    registry.observeAcceptedReady(
      DataSource.TDX,
      2,
      new Date('2026-08-04T01:00:02Z'),
    );

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls.map(([event]) => event.connectionId)).toEqual([
      1, 2,
    ]);
    expect(registry.getReadyControl(DataSource.TDX, 1)).toBeNull();
    expect(registry.getReadyControl(DataSource.TDX, 2)).toBe(control);
  });

  it('clears only the matching connection and registered control owner', () => {
    const registry = new RealtimeSubscriptionRuntimeRegistry();
    const control = buildControl();
    const disconnected = jest.fn();
    registry.subscribeDisconnected(disconnected);
    registry.registerControl(DataSource.QMT, control);
    registry.observeAcceptedReady(DataSource.QMT, 7);

    registry.observeDisconnected(DataSource.QMT, 6);
    expect(registry.getReadyControl(DataSource.QMT, 7)).toBe(control);
    expect(disconnected).not.toHaveBeenCalled();
    registry.observeDisconnected(DataSource.QMT, 7);
    expect(registry.getReadyControl(DataSource.QMT)).toBeNull();
    expect(disconnected).toHaveBeenCalledWith(DataSource.QMT);

    registry.unregisterControl(DataSource.QMT, buildControl());
    registry.observeAcceptedReady(DataSource.QMT, 8);
    expect(registry.getReadyControl(DataSource.QMT, 8)).toBe(control);
    registry.unregisterControl(DataSource.QMT, control);
    expect(registry.getReadyControl(DataSource.QMT)).toBeNull();
  });
});

function buildControl(): RealtimeSubscriptionControl {
  return {
    syncSubscriptions: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    getSubscriptions: jest.fn(),
  };
}
