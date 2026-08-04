import { DataSource } from '../enums/data-source.enum';
import { Period } from '../enums/period.enum';
import { K } from '../entities/k.entity';
import { Security } from '../entities/security.entity';
import { mapKToStrategyBar } from './k-strategy-bar.mapper';

describe('mapKToStrategyBar', () => {
  it('normalizes MySQL fixed-scale quantity and TDX amount from 万元 to 元', () => {
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
      amount: '123450',
      type: 'complete',
    });
  });

  it('does not scale QMT amount without a source-specific factor', () => {
    const k = makeK();
    k.source = DataSource.QMT;
    expect(mapKToStrategyBar(k).amount).toBe('12.345');
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
