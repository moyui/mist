import type { ChanBspEvent } from './chan-bsp.types';

export interface ChanBspEpisodeIdentity {
  readonly definitionId: number;
  readonly securityId: number;
  readonly source: 'tdx' | 'qmt';
  readonly level: number;
  readonly units: 'bi' | 'duan';
}

/**
 * Monotonic emission cursor for Chan BSP events.
 *
 * Emits only newly confirmed points: per identity it keeps the greatest
 * confirmed unit index and emits events whose unit index advances it. Points
 * that disappear and reappear under structure evolution (e.g. a channel
 * extension invalidating a third-type point) are NOT re-emitted, and the
 * cursor never regresses. Multiple point types on the same confirming unit
 * (e.g. second + third on one segment) are emitted independently.
 *
 * Lifecycle mirrors the evaluation windows/episodes: reset on trading-day
 * rollover, pruned with the registry scopes on reconciliation (bounded).
 */
export class ChanBspEpisodeCursor {
  private readonly cursors = new Map<string, number>();

  advance(
    identity: ChanBspEpisodeIdentity,
    events: readonly ChanBspEvent[],
  ): readonly ChanBspEvent[] {
    const key = identityKey(identity);
    const lastEmitted = this.cursors.get(key) ?? -1;
    const fresh = events.filter((event) => event.unitIndex > lastEmitted);
    if (fresh.length > 0) {
      const greatest = Math.max(...fresh.map((event) => event.unitIndex));
      this.cursors.set(key, Math.max(lastEmitted, greatest));
    }
    return Object.freeze(fresh);
  }

  reset(): void {
    this.cursors.clear();
  }

  retainIdentities(keys: ReadonlySet<string>): void {
    for (const key of this.cursors.keys()) {
      if (!keys.has(key)) this.cursors.delete(key);
    }
  }

  get activeCount(): number {
    return this.cursors.size;
  }
}

export function chanBspIdentityKey(identity: ChanBspEpisodeIdentity): string {
  return `${identity.definitionId}\u0000${identity.securityId}\u0000${identity.source}\u0000${identity.level}\u0000${identity.units}`;
}

function identityKey(identity: ChanBspEpisodeIdentity): string {
  return chanBspIdentityKey(identity);
}
