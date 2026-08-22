import type { ChanBspEvent } from './chan-bsp.types';
import { serializeChanBspContextSnapshot } from './chan-bsp.snapshot.serializer';

function buildEvent(overrides: Partial<ChanBspEvent> = {}): ChanBspEvent {
  return Object.freeze({
    type: 'first_buy',
    units: 'bi',
    time: new Date('2026-08-03T06:30:00+08:00'),
    price: 10.5,
    zhongshuIndex: 2,
    zg: 12.0,
    zd: 9.5,
    unitIndex: 5,
    ...overrides,
  });
}

describe('serializeChanBspContextSnapshot', () => {
  it('projects every structural field from the event and level', () => {
    const event = buildEvent();
    const snapshot = serializeChanBspContextSnapshot(event, 30);

    expect(snapshot).toEqual({
      chanBsp: {
        type: 'first_buy',
        units: 'bi',
        level: 30,
        zhongshuIndex: 2,
        zg: 12.0,
        zd: 9.5,
      },
    });
  });

  it('keeps null central-zone fields for second-type points', () => {
    const event = buildEvent({
      type: 'second_buy',
      zhongshuIndex: null,
      zg: null,
      zd: null,
    });
    const snapshot = serializeChanBspContextSnapshot(event, 5);

    expect(snapshot.chanBsp).toEqual({
      type: 'second_buy',
      units: 'bi',
      level: 5,
      zhongshuIndex: null,
      zg: null,
      zd: null,
    });
  });

  it('freezes both the snapshot and the nested chanBsp object', () => {
    const snapshot = serializeChanBspContextSnapshot(buildEvent(), 15);

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.chanBsp)).toBe(true);
  });

  it('matches the shape previously built inline by realtime evaluation', () => {
    const event = buildEvent({ type: 'third_sell', units: 'duan' });
    const snapshot = serializeChanBspContextSnapshot(event, 60);

    // 收敛前的实时侧内联构造（行为等价断言，防收敛漂移）。
    const legacyInline = Object.freeze({
      chanBsp: Object.freeze({
        type: event.type,
        units: event.units,
        level: 60,
        zhongshuIndex: event.zhongshuIndex,
        zg: event.zg,
        zd: event.zd,
      }),
    });

    expect(snapshot).toEqual(legacyInline);
  });
});
