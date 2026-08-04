import type { StrategySignalKind } from '@app/strategy';

export interface RealtimeEpisodeIdentity {
  readonly definitionId: number;
  readonly versionId: number;
  readonly securityId: number;
  readonly source: 'tdx' | 'qmt';
  readonly period: number;
  readonly signalKind: StrategySignalKind;
}

export type RealtimeEpisodeDecision = 'emit' | 'suppress' | 'clear' | 'no-op';

export class RealtimeEpisodeStore {
  private readonly active = new Set<string>();

  decide(
    identity: RealtimeEpisodeIdentity,
    result:
      | { readonly status: 'unavailable' }
      | { readonly status: 'evaluated'; readonly matched: boolean },
  ): RealtimeEpisodeDecision {
    const key = episodeKey(identity);
    if (result.status === 'unavailable') return 'no-op';
    if (!result.matched) {
      this.active.delete(key);
      return 'clear';
    }
    if (this.active.has(key)) return 'suppress';
    return 'emit';
  }

  activate(identity: RealtimeEpisodeIdentity): void {
    this.active.add(episodeKey(identity));
  }

  reset(): void {
    this.active.clear();
  }

  get activeCount(): number {
    return this.active.size;
  }
}

function episodeKey(identity: RealtimeEpisodeIdentity): string {
  return [
    identity.definitionId,
    identity.versionId,
    identity.securityId,
    identity.source,
    identity.period,
    identity.signalKind,
  ].join('\u0000');
}
