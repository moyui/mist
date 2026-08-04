import {
  QuantityForwardFillProjector,
  type ProjectedStrategyBar,
  type StrategyBar,
  type StrategyRealtimeMarketDataPort,
  type StrategyRealtimeSource,
} from '@app/strategy';

interface WindowGroup {
  capacity: number;
  readonly projector: QuantityForwardFillProjector;
  projectedBars: ProjectedStrategyBar[];
}

export type WindowAppendOutcome = 'appended' | 'duplicate';

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

    const existing = group.projectedBars.find(
      (projected) =>
        projected.rawBar.timestamp.getTime() === bar.timestamp.getTime(),
    );
    if (existing) {
      if (sameBar(existing.rawBar, bar)) return 'duplicate';
      throw new Error('conflicting canonical StrategyBar identity');
    }
    const last = group.projectedBars.at(-1)?.rawBar;
    if (last && last.timestamp.getTime() > bar.timestamp.getTime()) {
      throw new RangeError('shared strategy window rejects out-of-order bars');
    }
    group.projectedBars.push(group.projector.project(bar));
    if (group.projectedBars.length > group.capacity) {
      group.projectedBars.splice(
        0,
        group.projectedBars.length - group.capacity,
      );
    }
    return 'appended';
  }

  read(
    securityId: number,
    source: StrategyRealtimeSource,
    period: number,
  ): readonly ProjectedStrategyBar[] {
    return Object.freeze([
      ...(this.groups.get(groupKey(securityId, source, period))
        ?.projectedBars ?? []),
    ]);
  }

  reset(): void {
    this.groups.clear();
  }
}

function buildGroup(
  bars: readonly StrategyBar[],
  capacity: number,
): WindowGroup {
  const ordered = [...bars].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );
  const projector = new QuantityForwardFillProjector();
  const projectedBars: ProjectedStrategyBar[] = [];
  for (const bar of ordered) {
    const existing = projectedBars.at(-1)?.rawBar;
    if (existing?.timestamp.getTime() === bar.timestamp.getTime()) {
      if (sameBar(existing, bar)) continue;
      throw new Error('hydration contains conflicting StrategyBar identities');
    }
    projectedBars.push(projector.project(bar));
  }
  if (projectedBars.length > capacity) {
    projectedBars.splice(0, projectedBars.length - capacity);
  }
  return { capacity, projector, projectedBars };
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
