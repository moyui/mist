import { ChanBspEpisodeCursor, chanBspIdentityKey } from './chan-bsp.episode';
import type { ChanBspEvent } from './chan-bsp.types';

function event(
  unitIndex: number,
  type: ChanBspEvent['type'] = 'third_buy',
): ChanBspEvent {
  return {
    type,
    units: 'duan',
    time: new Date(`2024-08-04T0${1 + unitIndex}:00:00.000Z`),
    price: 10,
    zhongshuIndex: 0,
    zg: 11,
    zd: 9,
    unitIndex,
  };
}

const identity = {
  definitionId: 3,
  securityId: 9,
  source: 'tdx' as const,
  level: 30,
  units: 'duan' as const,
};

describe('ChanBspEpisodeCursor', () => {
  it('emits only events advancing the unit-index cursor', () => {
    const cursor = new ChanBspEpisodeCursor();

    expect(cursor.advance(identity, [event(2), event(5)])).toEqual([
      event(2),
      event(5),
    ]);
    expect(cursor.advance(identity, [event(5), event(6)])).toEqual([event(6)]);
  });

  it('does not re-emit events at or below the cursor', () => {
    const cursor = new ChanBspEpisodeCursor();
    cursor.advance(identity, [event(4)]);

    expect(cursor.advance(identity, [event(3), event(4)])).toEqual([]);
  });

  it('does not re-emit a point that disappeared and reappeared under structure evolution', () => {
    const cursor = new ChanBspEpisodeCursor();
    cursor.advance(identity, [event(5)]);

    // structure evolves: point 5 disappears, then a later evaluation confirms
    // the same structure again — unit index does not advance, nothing emitted
    expect(cursor.advance(identity, [event(5)])).toEqual([]);
    expect(cursor.activeCount).toBe(1);
  });

  it('emits multiple point types on the same confirming unit independently', () => {
    const cursor = new ChanBspEpisodeCursor();

    expect(
      cursor.advance(identity, [event(3, 'second_buy'), event(3, 'third_buy')]),
    ).toEqual([event(3, 'second_buy'), event(3, 'third_buy')]);
    // same units, different confirmation — no new points
    expect(cursor.advance(identity, [event(3, 'second_buy')])).toEqual([]);
  });

  it('keeps identities isolated by identity', () => {
    const cursor = new ChanBspEpisodeCursor();
    const other = { ...identity, securityId: 10 };

    cursor.advance(identity, [event(5)]);
    expect(cursor.advance(other, [event(5)])).toEqual([event(5)]);
  });

  it('resets all cursors', () => {
    const cursor = new ChanBspEpisodeCursor();
    cursor.advance(identity, [event(5)]);

    cursor.reset();

    expect(cursor.activeCount).toBe(0);
    expect(cursor.advance(identity, [event(5)])).toEqual([event(5)]);
  });

  it('prunes cursors not retained on registry reconciliation', () => {
    const cursor = new ChanBspEpisodeCursor();
    cursor.advance(identity, [event(5)]);
    cursor.advance({ ...identity, securityId: 10 }, [event(6)]);

    cursor.retainIdentities(new Set([chanBspIdentityKey(identity)]));

    expect(cursor.activeCount).toBe(1);
  });

  it('builds a stable identity key with unambiguous separators', () => {
    expect(chanBspIdentityKey(identity)).toBe(
      '3\u00009\u0000tdx\u000030\u0000duan',
    );
  });
});
