import { DataSource, Period } from '@app/shared-data';
import type {
  StrategyRealtimeSource,
  StrategyReplayWindowCriteria,
} from '@app/strategy';
import { BacktestMarketDataAdapter } from './backtest-market-data.adapter';

function makeBuilder(rows: unknown[]) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'limit',
  ]) {
    builder[method] = jest.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  }
  builder.getMany = jest.fn().mockResolvedValue(rows);
  return { builder, calls };
}

function row(timestamp: string) {
  return Object.assign({
    securityId: 7,
    source: DataSource.TDX,
    period: Period.ONE_MIN,
    timestamp: new Date(timestamp),
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
    volume: '100',
    amount: '12.345',
  });
}

describe('BacktestMarketDataAdapter', () => {
  it('uses source-exact keyset criteria and only maps returned rows', async () => {
    const query = makeBuilder([row('2026-08-04T01:30:00.000Z')]);
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(query.builder),
    };
    const adapter = new BacktestMarketDataAdapter(repository as any);

    const page = await adapter.readReplayPage({
      securityId: 7,
      source: 'tdx',
      period: Period.ONE_MIN,
      startAt: new Date('2026-08-04T01:30:00.000Z'),
      endAt: new Date('2026-08-04T02:30:00.000Z'),
    });

    expect(repository.createQueryBuilder).toHaveBeenCalledWith('k');
    expect(query.builder.select).toHaveBeenCalledWith([
      'k.source',
      'k.period',
      'k.timestamp',
      'k.open',
      'k.high',
      'k.low',
      'k.close',
      'k.volume',
      'k.amount',
    ]);
    expect(query.calls).toContainEqual({
      method: 'where',
      args: ['k.securityId = :securityId', { securityId: 7 }],
    });
    expect(query.calls).toContainEqual({
      method: 'andWhere',
      args: [
        'k.timestamp >= :startAt',
        {
          startAt: new Date('2026-08-04T01:30:00.000Z'),
        },
      ],
    });
    expect(query.calls).toContainEqual({
      method: 'orderBy',
      args: ['k.timestamp', 'ASC'],
    });
    expect(query.builder.limit).toHaveBeenCalledWith(1000);
    expect(page.bars).toHaveLength(1);
    expect(page.nextAfterTimestamp).toBeNull();
  });

  it('adds a strict timestamp cursor only on later pages', async () => {
    const afterTimestamp = new Date('2026-08-04T01:30:00.000Z');
    const query = makeBuilder([row('2026-08-04T01:31:00.000Z')]);
    const adapter = new BacktestMarketDataAdapter({
      createQueryBuilder: jest.fn().mockReturnValue(query.builder),
    } as any);

    await adapter.readReplayPage({
      securityId: 7,
      source: 'tdx',
      period: Period.ONE_MIN,
      startAt: new Date('2026-08-04T01:30:00.000Z'),
      endAt: new Date('2026-08-04T02:30:00.000Z'),
      afterTimestamp,
    });

    expect(query.calls).toContainEqual({
      method: 'andWhere',
      args: ['k.timestamp > :afterTimestamp', { afterTimestamp }],
    });
  });

  it('loads the last bars strictly before endAt and returns them ascending', async () => {
    const find = jest
      .fn()
      .mockResolvedValue([
        row('2026-08-04T01:31:00.000Z'),
        row('2026-08-04T01:30:00.000Z'),
      ]);
    const adapter = new BacktestMarketDataAdapter({ find } as any);

    const window = await adapter.loadReplayWindow({
      securityId: 7,
      source: 'tdx',
      period: Period.ONE_MIN,
      endAt: new Date('2026-08-04T01:32:00.000Z'),
      requiredBars: 5,
    });

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { timestamp: 'DESC' },
        take: 5,
      }),
    );
    expect(window.bars.map((bar) => bar.timestamp.toISOString())).toEqual([
      '2026-08-04T01:30:00.000Z',
      '2026-08-04T01:31:00.000Z',
    ]);
  });

  it('returns an empty window when no bar precedes endAt', async () => {
    const adapter = new BacktestMarketDataAdapter({
      find: jest.fn().mockResolvedValue([]),
    } as any);

    const window = await adapter.loadReplayWindow({
      securityId: 7,
      source: 'qmt',
      period: Period.ONE_MIN,
      endAt: new Date('2026-08-04T01:32:00.000Z'),
      requiredBars: 5,
    });

    expect(window.bars).toEqual([]);
  });

  it.each<[string, StrategyReplayWindowCriteria]>([
    [
      'securityId',
      {
        securityId: 0,
        source: 'tdx',
        period: 1,
        endAt: new Date(),
        requiredBars: 2,
      },
    ],
    [
      'source',
      {
        securityId: 1,
        source: 'ef' as StrategyRealtimeSource,
        period: 1,
        endAt: new Date(),
        requiredBars: 2,
      },
    ],
    [
      'endAt',
      {
        securityId: 1,
        source: 'tdx',
        period: 1,
        endAt: new Date('nope'),
        requiredBars: 2,
      },
    ],
    [
      'requiredBars',
      {
        securityId: 1,
        source: 'tdx',
        period: 1,
        endAt: new Date(),
        requiredBars: 0,
      },
    ],
  ])('rejects an invalid %s window criteria', async (_label, criteria) => {
    const adapter = new BacktestMarketDataAdapter({
      find: jest.fn(),
    } as any);

    await expect(adapter.loadReplayWindow(criteria)).rejects.toThrow(TypeError);
  });
});
