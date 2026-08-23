import { DataSource } from '../enums/data-source.enum';
import { Period } from '../enums/period.enum';
import { K } from '../entities/k.entity';
import { Security } from '../entities/security.entity';
import { mapKToStrategyBar } from './k-strategy-bar.mapper';

describe('mapKToStrategyBar', () => {
  it('normalizes MySQL fixed-scale quantity for TDX without source scaling', () => {
    const k = makeK();

    expect(mapKToStrategyBar(k)).toEqual({
      securityId: 7,
      source: 'tdx',
      period: 1,
      timestamp: new Date('2026-08-01T01:30:00.000Z'),
      open: 10,
      high: 11,
      low: 9,
      close: 10.5,
      volume: '100',
      amount: '12.345',
      type: 'complete',
    });
  });

  it('normalizes QMT quantity without source scaling (k table is canonical)', () => {
    const k = makeK();
    k.source = DataSource.QMT;
    expect(mapKToStrategyBar(k)).toMatchObject({
      volume: '100',
      amount: '12.345',
    });
  });

  it('passes null quantity through unchanged', () => {
    const k = makeK();
    k.volume = null;
    k.amount = null;
    expect(mapKToStrategyBar(k)).toMatchObject({
      volume: null,
      amount: null,
    });
  });

  it('accepts selected scalar securityId when the relation is not loaded', () => {
    const k = makeK();
    k.security = undefined as unknown as Security;
    k.securityId = 8;
    expect(mapKToStrategyBar(k).securityId).toBe(8);
  });
});

function makeK(): K {
  return Object.assign(new K(), {
    security: Object.assign(new Security(), { id: 7 }),
    securityId: 7,
    source: DataSource.TDX,
    period: Period.ONE_MIN,
    timestamp: new Date('2026-08-01T01:30:00.000Z'),
    open: '10.00',
    high: '11.00',
    low: '9.00',
    close: '10.50',
    volume: '100.00000000',
    amount: '12.34500000',
  });
}
