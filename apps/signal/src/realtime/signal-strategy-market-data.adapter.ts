import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, K, mapKToStrategyBar } from '@app/shared-data';
import {
  KPriceProjector,
  type StrategyBar,
  type StrategyMarketObservation,
  type StrategyRealtimeMarketDataPort,
  type StrategyRealtimeWindow,
  type StrategyRealtimeWindowCriteria,
  type StrategyTrigger,
} from '@app/strategy';
import {
  closedCandleKey,
  decodeRealtimeClosedCandleRecordV1,
  type RealtimeClosedCandleRecordV1,
} from '@app/realtime';
import { Decimal8 } from '@app/decimal';
import { fromZonedTime } from 'date-fns-tz';
import { ASIA_SHANGHAI_TIMEZONE } from '@app/timezone';
import { LessThan, Repository } from 'typeorm';
import { SignalRealtimeRedisService } from './signal-realtime-redis.service';

const REALTIME_PERIODS = new Set([1, 5, 15, 30, 60]);

@Injectable()
export class SignalStrategyMarketDataAdapter
  implements StrategyRealtimeMarketDataPort
{
  constructor(
    @InjectRepository(K) private readonly kRepository: Repository<K>,
    private readonly redis: SignalRealtimeRedisService,
  ) {}

  async resolveRealtimeObservation(
    trigger: StrategyTrigger,
  ): Promise<StrategyMarketObservation> {
    assertTrigger(trigger);
    if (trigger.outcome === 'discarded') {
      return Object.freeze({
        outcome: 'discarded',
        securityId: trigger.securityId,
        source: trigger.source,
        period: 1,
        timestamp: new Date(trigger.timestamp.getTime()),
      });
    }
    const tradingDay = shanghaiTradingDay(trigger.timestamp);
    const raw = await this.redis.client.hget(
      closedCandleKey(tradingDay, trigger.source, trigger.securityId),
      String(trigger.timestamp.getTime()),
    );
    if (raw === null) {
      throw new Error('sealed realtime candle record is missing');
    }
    const record = decodeRealtimeClosedCandleRecordV1(parseJson(raw));
    return Object.freeze({
      outcome: 'sealed',
      bar: mapClosedRecord(trigger, record),
    });
  }

  async loadRealtimeWindow(
    criteria: StrategyRealtimeWindowCriteria,
  ): Promise<StrategyRealtimeWindow> {
    assertCriteria(criteria);
    const hydrationBarLimit = criteria.requiredBars + 1;
    const tradingDay = shanghaiTradingDay(criteria.anchorAt);
    const dayStart = shanghaiDayStart(tradingDay);
    const redisBars = await this.loadCurrentDayBars(criteria, tradingDay);
    const historicalNeeded = Math.max(0, hydrationBarLimit - redisBars.length);
    const historical =
      historicalNeeded === 0
        ? []
        : await this.kRepository.find({
            where: {
              securityId: criteria.securityId,
              source: toDataSource(criteria.source),
              period: criteria.period,
              timestamp: LessThan(dayStart),
            },
            relations: { security: true },
            order: { timestamp: 'DESC' },
            take: historicalNeeded,
          });
    const bars = [...historical.reverse().map(mapKToStrategyBar), ...redisBars];
    return Object.freeze({
      bars: Object.freeze(bars.slice(-hydrationBarLimit)),
    });
  }

  private async loadCurrentDayBars(
    criteria: StrategyRealtimeWindowCriteria,
    tradingDay: string,
  ): Promise<readonly StrategyBar[]> {
    const values = await this.redis.client.hgetall(
      closedCandleKey(tradingDay, criteria.source, criteria.securityId),
    );
    const oneMinuteBars = Object.entries(values)
      .map(([timestampText, raw]) => {
        const timestampMs = Number(timestampText);
        if (!Number.isSafeInteger(timestampMs)) {
          throw new TypeError('closed-candle hash field must be epoch ms');
        }
        const trigger: StrategyTrigger = {
          securityId: criteria.securityId,
          source: criteria.source,
          period: 1,
          timestamp: new Date(timestampMs),
          outcome: 'sealed',
        };
        return mapClosedRecord(
          trigger,
          decodeRealtimeClosedCandleRecordV1(parseJson(raw)),
        );
      })
      .filter(
        (bar) =>
          shanghaiTradingDay(bar.timestamp) === tradingDay &&
          bar.timestamp.getTime() < criteria.anchorAt.getTime(),
      )
      .sort(
        (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
      );
    if (criteria.period === 1) return oneMinuteBars;
    return derivePeriodBars(oneMinuteBars, criteria.period).filter(
      (bar) => bar.timestamp.getTime() < criteria.anchorAt.getTime(),
    );
  }
}

function mapClosedRecord(
  trigger: StrategyTrigger,
  record: RealtimeClosedCandleRecordV1,
): StrategyBar {
  const bar = Object.freeze({
    securityId: trigger.securityId,
    source: trigger.source,
    period: 1,
    timestamp: new Date(trigger.timestamp.getTime()),
    open: KPriceProjector(record.o),
    high: KPriceProjector(record.h),
    low: KPriceProjector(record.l),
    close: KPriceProjector(record.c),
    volume: record.v,
    amount: record.a,
    type: 'complete' as const,
  });
  if (
    bar.low > bar.high ||
    bar.high < Math.max(bar.open, bar.close) ||
    bar.low > Math.min(bar.open, bar.close)
  ) {
    throw new TypeError('closed-candle OHLC relationship is invalid');
  }
  return bar;
}

function derivePeriodBars(
  bars: readonly StrategyBar[],
  period: number,
): StrategyBar[] {
  const groups = new Map<number, StrategyBar[]>();
  for (const bar of bars) {
    let position;
    try {
      position = sessionPosition(bar.timestamp);
    } catch {
      // A legacy or anomalous sealed bar outside the session (e.g. pre-fix
      // 15:01/15:02 dead-time buckets still present in Redis) must not fail
      // the whole evaluation window load — skip it. Volume is zero for such
      // bars, so no market data is lost.
      continue;
    }
    const slotStart =
      position.sessionStartMs +
      Math.floor(position.minuteOffset / period) * period * 60_000;
    const group = groups.get(slotStart) ?? [];
    group.push(bar);
    groups.set(slotStart, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([slotStart, slotBars]) => reducePeriod(slotStart, period, slotBars));
}

function reducePeriod(
  slotStart: number,
  period: number,
  bars: readonly StrategyBar[],
): StrategyBar {
  const ordered = [...bars].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );
  const first = ordered[0];
  const last = ordered.at(-1)!;
  return Object.freeze({
    securityId: first.securityId,
    source: first.source,
    period,
    timestamp: new Date(slotStart),
    open: first.open,
    high: Math.max(...ordered.map((bar) => bar.high)),
    low: Math.min(...ordered.map((bar) => bar.low)),
    close: last.close,
    volume: sumQuantity(ordered, 'volume'),
    amount: sumQuantity(ordered, 'amount'),
    type: ordered.length === period ? 'complete' : 'incomplete',
  });
}

function sumQuantity(
  bars: readonly StrategyBar[],
  field: 'volume' | 'amount',
): string | null {
  let total = Decimal8.ZERO;
  for (const bar of bars) {
    if (bar[field] === null) return null;
    total = total.add(Decimal8.parseCanonical(bar[field]));
  }
  return total.formatCanonical();
}

function sessionPosition(timestamp: Date): {
  sessionStartMs: number;
  minuteOffset: number;
} {
  const parts = shanghaiParts(timestamp);
  const wallMinute = parts.hour * 60 + parts.minute;
  const morningStart = 9 * 60 + 30;
  const afternoonStart = 13 * 60;
  const start =
    wallMinute >= morningStart && wallMinute < 11 * 60 + 31
      ? morningStart
      : wallMinute >= afternoonStart && wallMinute < 15 * 60 + 1
        ? afternoonStart
        : null;
  if (start === null) throw new RangeError('realtime K is outside session');
  const minuteOffset = wallMinute - start;
  return {
    sessionStartMs: timestamp.getTime() - minuteOffset * 60_000,
    minuteOffset,
  };
}

function shanghaiTradingDay(timestamp: Date): string {
  const parts = shanghaiParts(timestamp);
  return `${parts.year}${String(parts.month).padStart(2, '0')}${String(parts.day).padStart(2, '0')}`;
}

function shanghaiDayStart(tradingDay: string): Date {
  return fromZonedTime(
    `${tradingDay.slice(0, 4)}-${tradingDay.slice(4, 6)}-${tradingDay.slice(6, 8)}T00:00:00.000`,
    ASIA_SHANGHAI_TIMEZONE,
  );
}

function shanghaiParts(timestamp: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) {
    throw new TypeError('realtime K timestamp must be valid');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ASIA_SHANGHAI_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new TypeError('could not resolve Shanghai timestamp');
    return Number(value);
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

function assertTrigger(trigger: StrategyTrigger): void {
  if (
    !Number.isSafeInteger(trigger.securityId) ||
    trigger.securityId <= 0 ||
    trigger.period !== 1 ||
    trigger.timestamp.getTime() % 60_000 !== 0
  ) {
    throw new TypeError('Invalid realtime strategy trigger');
  }
}

function assertCriteria(criteria: StrategyRealtimeWindowCriteria): void {
  if (
    !Number.isSafeInteger(criteria.securityId) ||
    criteria.securityId <= 0 ||
    !REALTIME_PERIODS.has(criteria.period) ||
    !Number.isSafeInteger(criteria.requiredBars) ||
    criteria.requiredBars <= 0 ||
    criteria.requiredBars > 800 ||
    criteria.anchorAt.getTime() % 60_000 !== 0
  ) {
    throw new TypeError('Invalid realtime window criteria');
  }
}

function toDataSource(source: 'tdx' | 'qmt'): DataSource {
  return source === 'tdx' ? DataSource.TDX : DataSource.QMT;
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
