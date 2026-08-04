import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { K, mapKToStrategyBar } from '@app/shared-data';
import type {
  StrategyReplayMarketDataPort,
  StrategyReplayPage,
  StrategyReplayPageCriteria,
} from '@app/strategy';
import type { Repository } from 'typeorm';

export const BACKTEST_REPLAY_PAGE_SIZE = 1_000;

@Injectable()
export class BacktestMarketDataAdapter implements StrategyReplayMarketDataPort {
  constructor(
    @InjectRepository(K) private readonly repository: Repository<K>,
  ) {}

  async readReplayPage(
    criteria: StrategyReplayPageCriteria,
  ): Promise<StrategyReplayPage> {
    assertCriteria(criteria);
    const query = this.repository
      .createQueryBuilder('k')
      .select([
        'k.source',
        'k.period',
        'k.timestamp',
        'k.open',
        'k.high',
        'k.low',
        'k.close',
        'k.volume',
        'k.amount',
      ])
      .addSelect('k.securityId')
      .where('k.security_id = :securityId', {
        securityId: criteria.securityId,
      })
      .andWhere('k.source = :source', { source: criteria.source })
      .andWhere('k.period = :period', { period: criteria.period })
      .andWhere('k.timestamp >= :startAt', { startAt: criteria.startAt })
      .andWhere('k.timestamp <= :endAt', { endAt: criteria.endAt })
      .orderBy('k.timestamp', 'ASC')
      .limit(BACKTEST_REPLAY_PAGE_SIZE);

    if (criteria.afterTimestamp) {
      query.andWhere('k.timestamp > :afterTimestamp', {
        afterTimestamp: criteria.afterTimestamp,
      });
    }

    const rows = await query.getMany();
    const bars = rows.map(mapKToStrategyBar);
    return {
      bars,
      nextAfterTimestamp:
        bars.length === BACKTEST_REPLAY_PAGE_SIZE
          ? new Date(bars[bars.length - 1].timestamp.getTime())
          : null,
    };
  }
}

function assertCriteria(criteria: StrategyReplayPageCriteria): void {
  if (!Number.isSafeInteger(criteria.securityId) || criteria.securityId <= 0) {
    throw new TypeError('replay securityId must be a positive safe integer');
  }
  if (!Number.isSafeInteger(criteria.period) || criteria.period <= 0) {
    throw new TypeError('replay period must be a positive safe integer');
  }
  if (criteria.source !== 'tdx' && criteria.source !== 'qmt') {
    throw new TypeError('backtest replay source must be tdx or qmt');
  }
  if (!validDate(criteria.startAt) || !validDate(criteria.endAt)) {
    throw new TypeError('replay range requires valid dates');
  }
  if (criteria.startAt > criteria.endAt) {
    throw new RangeError('replay startAt must not be after endAt');
  }
  if (criteria.afterTimestamp && !validDate(criteria.afterTimestamp)) {
    throw new TypeError('replay cursor requires a valid date');
  }
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}
