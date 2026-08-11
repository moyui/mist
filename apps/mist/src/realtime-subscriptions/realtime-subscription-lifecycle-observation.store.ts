import { Injectable } from '@nestjs/common';
import { DataSource } from '@app/shared-data';
import { RealtimeSubscriptionSource } from './realtime-subscription.constants';
import {
  RealtimeActiveEvidence,
  RealtimeConvergence,
  RealtimeConvergenceReason,
} from './vo/realtime-subscription.vo';

export type RealtimeLifecycleTrigger =
  | 'accepted_ready'
  | 'weekday_0915'
  | 'intraday_activation'
  | 'scheduled_reconcile'
  | 'auto_reconcile_enabled';

interface SourceObservation {
  running: boolean;
  desired: ReadonlySet<string> | null;
  active: ReadonlySet<string> | null;
  evidence: RealtimeActiveEvidence | null;
  failureReason: RealtimeConvergenceReason | null;
  trigger: RealtimeLifecycleTrigger | null;
  result: 'never' | 'pending' | 'success' | 'failure';
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  triggerTotals: Map<RealtimeLifecycleTrigger, number>;
  resultTotals: Map<string, number>;
}

export interface RealtimeAssignmentObservation {
  active: boolean | null;
  activeEvidence: RealtimeActiveEvidence | null;
  convergence: RealtimeConvergence;
  convergenceReason: RealtimeConvergenceReason | null;
  deferredRemovalReason: 'awaiting_full_reset' | null;
}

@Injectable()
export class RealtimeSubscriptionLifecycleObservationStore {
  private readonly sources = new Map<
    RealtimeSubscriptionSource,
    SourceObservation
  >();

  begin(
    source: RealtimeSubscriptionSource,
    trigger: RealtimeLifecycleTrigger,
    at = new Date(),
  ): void {
    const current = this.current(source);
    this.sources.set(source, {
      ...current,
      running: true,
      failureReason: null,
      trigger,
      result: 'pending',
      lastAttemptAt: at,
      triggerTotals: increment(current.triggerTotals, trigger),
    });
  }

  setDesired(
    source: RealtimeSubscriptionSource,
    symbols: readonly string[],
  ): void {
    const current = this.current(source);
    this.sources.set(source, { ...current, desired: new Set(symbols) });
  }

  replaceActive(
    source: RealtimeSubscriptionSource,
    symbols: readonly string[],
  ): void {
    const current = this.current(source);
    this.sources.set(source, {
      ...current,
      active: new Set(symbols),
      evidence:
        source === DataSource.TDX ? 'tdx_native_list' : 'qmt_durable_registry',
    });
  }

  succeed(source: RealtimeSubscriptionSource, at = new Date()): void {
    const current = this.current(source);
    const resultKey = `${current.trigger ?? 'accepted_ready'}|success|none`;
    this.sources.set(source, {
      ...current,
      running: false,
      failureReason: null,
      result: 'success',
      lastSuccessAt: at,
      resultTotals: increment(current.resultTotals, resultKey),
    });
  }

  fail(source: RealtimeSubscriptionSource, reason: string): void {
    const current = this.current(source);
    const failureReason = classifyFailureReason(reason);
    const resultKey = `${current.trigger ?? 'accepted_ready'}|failure|${failureReason}`;
    this.sources.set(source, {
      ...current,
      running: false,
      failureReason,
      result: 'failure',
      resultTotals: increment(current.resultTotals, resultKey),
    });
  }

  disconnect(source: RealtimeSubscriptionSource): void {
    const current = this.current(source);
    this.sources.set(source, {
      ...current,
      running: false,
      active: null,
      evidence: null,
      failureReason: 'readback_stale',
      result: 'failure',
    });
  }

  project(
    source: RealtimeSubscriptionSource,
    providerSymbol: string,
    desired: boolean,
    lifecycleEnabled: boolean,
  ): RealtimeAssignmentObservation {
    if (!lifecycleEnabled) return unknownProjection('lifecycle_disabled');
    const current = this.current(source);
    const active = current.active?.has(providerSymbol) ?? null;
    const deferredRemovalReason =
      desired === false && active === true ? 'awaiting_full_reset' : null;
    if (current.running) {
      return {
        active,
        activeEvidence: current.evidence,
        convergence: 'pending',
        convergenceReason: deferredRemovalReason,
        deferredRemovalReason,
      };
    }
    if (current.failureReason) {
      const blocked = isBlockedReason(current.failureReason);
      return {
        active,
        activeEvidence: current.evidence,
        convergence: blocked
          ? 'blocked'
          : current.failureReason === 'control_failed' && active !== null
            ? 'drifted'
            : 'unknown',
        convergenceReason: current.failureReason,
        deferredRemovalReason,
      };
    }
    if (active === null) return unknownProjection('transport_not_ready');
    if (desired === active) {
      return {
        active,
        activeEvidence: current.evidence,
        convergence: 'converged',
        convergenceReason: null,
        deferredRemovalReason: null,
      };
    }
    return {
      active,
      activeEvidence: current.evidence,
      convergence: 'drifted',
      convergenceReason: desired
        ? 'desired_missing_active'
        : 'awaiting_full_reset',
      deferredRemovalReason,
    };
  }

  health(mode: 'off' | 'on', now = new Date()) {
    return {
      mode,
      sources: ([DataSource.TDX, DataSource.QMT] as const).map((source) => {
        const current = this.current(source);
        const convergence = sourceConvergence(current, mode);
        const active = current.active;
        const desired = current.desired;
        const activeCount = active?.size ?? null;
        const convergedCount =
          active && desired
            ? [...desired].filter((symbol) => active.has(symbol)).length
            : null;
        const deferredRemovalCount =
          active && desired
            ? [...active].filter((symbol) => !desired.has(symbol)).length
            : null;
        return {
          source,
          desiredCount: desired?.size ?? null,
          activeCount,
          convergedCount,
          deferredRemovalCount,
          activeEvidence: current.evidence,
          convergence: convergence.convergence,
          trigger: current.trigger,
          result: current.result,
          reason: convergence.reason,
          lastAttemptAt: current.lastAttemptAt?.toISOString() ?? null,
          lastAttemptAgeSeconds: ageSeconds(current.lastAttemptAt, now),
          lastSuccessAt: current.lastSuccessAt?.toISOString() ?? null,
          lastSuccessAgeSeconds: ageSeconds(current.lastSuccessAt, now),
          triggerTotals: [...current.triggerTotals]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([trigger, value]) => ({ trigger, value })),
          resultTotals: [...current.resultTotals]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => {
              const [trigger, result, reason] = key.split('|');
              return { trigger, result, reason, value };
            }),
        };
      }),
    };
  }

  private current(source: RealtimeSubscriptionSource): SourceObservation {
    return (
      this.sources.get(source) ?? {
        running: false,
        desired: null,
        active: null,
        evidence: null,
        failureReason: null,
        trigger: null,
        result: 'never',
        lastAttemptAt: null,
        lastSuccessAt: null,
        triggerTotals: new Map(),
        resultTotals: new Map(),
      }
    );
  }
}

function increment<K>(values: ReadonlyMap<K, number>, key: K): Map<K, number> {
  const next = new Map(values);
  next.set(key, (next.get(key) ?? 0) + 1);
  return next;
}

function sourceConvergence(
  current: SourceObservation,
  mode: 'off' | 'on',
): {
  convergence: RealtimeConvergence;
  reason: RealtimeConvergenceReason | null;
} {
  if (mode === 'off') {
    return { convergence: 'unknown', reason: 'lifecycle_disabled' };
  }
  if (current.running) return { convergence: 'pending', reason: null };
  if (current.failureReason) {
    return {
      convergence: isBlockedReason(current.failureReason)
        ? 'blocked'
        : current.failureReason === 'control_failed' && current.active !== null
          ? 'drifted'
          : 'unknown',
      reason: current.failureReason,
    };
  }
  if (current.active === null || current.desired === null) {
    return { convergence: 'unknown', reason: 'transport_not_ready' };
  }
  const exact =
    current.active.size === current.desired.size &&
    [...current.desired].every((symbol) => current.active?.has(symbol));
  if (exact) return { convergence: 'converged', reason: null };
  const desiredMissing = [...current.desired].some(
    (symbol) => !current.active?.has(symbol),
  );
  return {
    convergence: 'drifted',
    reason: desiredMissing ? 'desired_missing_active' : 'awaiting_full_reset',
  };
}

function ageSeconds(at: Date | null, now: Date): number | null {
  return at ? Math.max(0, (now.getTime() - at.getTime()) / 1000) : null;
}

function unknownProjection(
  reason: RealtimeConvergenceReason,
): RealtimeAssignmentObservation {
  return {
    active: null,
    activeEvidence: null,
    convergence: 'unknown',
    convergenceReason: reason,
    deferredRemovalReason: null,
  };
}

function classifyFailureReason(reason: string): RealtimeConvergenceReason {
  if (reason.includes('RECONCILIATION_REQUIRED')) {
    return 'qmt_reconciliation_required';
  }
  if (reason.includes('JOURNAL')) return 'qmt_journal_unhealthy';
  if (reason.includes('CAPACITY')) return 'source_capacity_blocked';
  if (reason.includes('CONNECTION_STALE')) return 'readback_stale';
  if (
    reason.includes('TIMEOUT') ||
    reason.includes('DISCONNECTED') ||
    reason.includes('SEND_FAILED') ||
    reason.includes('DEADLINE')
  ) {
    return 'control_outcome_unknown';
  }
  return 'control_failed';
}

function isBlockedReason(reason: RealtimeConvergenceReason): boolean {
  return (
    reason === 'qmt_reconciliation_required' ||
    reason === 'qmt_journal_unhealthy' ||
    reason === 'source_capacity_blocked'
  );
}
