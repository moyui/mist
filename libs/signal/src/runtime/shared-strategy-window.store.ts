import {
  StrategySeriesImputer,
  type ProjectedStrategyBar,
  type StrategyBar,
  type StrategyRealtimeMarketDataPort,
  type StrategyRealtimeSource,
} from '@app/strategy';

interface WindowGroup {
  capacity: number;
  readonly imputer: StrategySeriesImputer;
}

export type WindowAppendOutcome = 'appended' | 'duplicate';

export interface RealtimeWindowGroupIdentity {
  readonly securityId: number;
  readonly source: StrategyRealtimeSource;
  readonly period: number;
}

export class SharedStrategyWindowStore {
  private readonly groups = new Map<string, WindowGroup>();

  async prepare(
    marketData: StrategyRealtimeMarketDataPort,
    bar: StrategyBar,
    requiredBars: number,
  ): Promise<WindowAppendOutcome> {
    assertCapacity(requiredBars);
    const key = groupKey(bar.securityId, bar.source, bar.period);
    let group = this.groups.get(key);
    if (!group || requiredBars > group.capacity) {
      const hydrated = await marketData.loadRealtimeWindow({
        securityId: bar.securityId,
        source: requireRealtimeSource(bar.source),
        period: bar.period,
        anchorAt: bar.timestamp,
        requiredBars,
      });
      group = buildGroup(hydrated.bars, requiredBars);
      this.groups.set(key, group);
    }

    const projectedBars = group.imputer.read();
    const existing = projectedBars.find(
      (projected) =>
        projected.rawBar.timestamp.getTime() === bar.timestamp.getTime(),
    );
    if (existing) {
      if (sameBar(existing.rawBar, bar)) return 'duplicate';
      throw new Error('conflicting canonical StrategyBar identity');
    }
    const last = projectedBars.at(-1)?.rawBar;
    if (last && last.timestamp.getTime() > bar.timestamp.getTime()) {
      throw new RangeError('shared strategy window rejects out-of-order bars');
    }
    group.imputer.append(bar);
    while (group.imputer.read().length > group.capacity) {
      group.imputer.trim();
    }
    return 'appended';
  }

  read(
    securityId: number,
    source: StrategyRealtimeSource,
    period: number,
  ): readonly ProjectedStrategyBar[] {
    return (
      this.groups.get(groupKey(securityId, source, period))?.imputer.read() ??
      Object.freeze([])
    );
  }

  reset(): void {
    this.groups.clear();
  }

  retainGroups(groups: readonly RealtimeWindowGroupIdentity[]): void {
    const retained = new Set(
      groups.map((group) =>
        groupKey(group.securityId, group.source, group.period),
      ),
    );
    for (const key of this.groups.keys()) {
      if (!retained.has(key)) this.groups.delete(key);
    }
  }

  get groupCount(): number {
    return this.groups.size;
  }

  diagnostics(): Readonly<{
    groupCount: number;
    rawBarCount: number;
    derivedBarCount: number;
  }> {
    let rawBarCount = 0;
    let derivedBarCount = 0;
    for (const group of this.groups.values()) {
      for (const bar of group.imputer.read()) {
        if (bar.rawBar.period === 1) rawBarCount += 1;
        else derivedBarCount += 1;
      }
    }
    return Object.freeze({
      groupCount: this.groups.size,
      rawBarCount,
      derivedBarCount,
    });
  }
}

function buildGroup(
  bars: readonly StrategyBar[],
  capacity: number,
): WindowGroup {
  const ordered = [...bars].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous.timestamp.getTime() === current.timestamp.getTime()) {
      if (sameBar(previous, current)) {
        ordered.splice(index, 1);
        index -= 1;
        continue;
      }
      throw new Error('hydration contains conflicting StrategyBar identities');
    }
  }
  const imputer = new StrategySeriesImputer();
  imputer.hydrate(ordered);
  while (imputer.read().length > capacity) {
    imputer.trim();
  }
  return { capacity, imputer };
}

function sameBar(left: StrategyBar, right: StrategyBar): boolean {
  return (
    left.securityId === right.securityId &&
    left.source === right.source &&
    left.period === right.period &&
    left.timestamp.getTime() === right.timestamp.getTime() &&
    left.open === right.open &&
    left.high === right.high &&
    left.low === right.low &&
    left.close === right.close &&
    left.volume === right.volume &&
    left.amount === right.amount &&
    left.type === right.type
  );
}

function requireRealtimeSource(
  source: StrategyBar['source'],
): StrategyRealtimeSource {
  if (source !== 'tdx' && source !== 'qmt') {
    throw new TypeError('realtime window source must be tdx or qmt');
  }
  return source;
}

function assertCapacity(capacity: number): void {
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new TypeError(
      'strategy window capacity must be a positive safe integer',
    );
  }
}

function groupKey(
  securityId: number,
  source: StrategyBar['source'],
  period: number,
): string {
  return `${securityId}\u0000${source}\u0000${period}`;
}
