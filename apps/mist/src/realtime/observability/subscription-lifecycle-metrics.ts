import { metrics } from '@opentelemetry/api';
import { RealtimeSecurityAllowlistService } from '../realtime-security-allowlist.service';
import { RealtimeSubscriptionLifecycleObservationStore } from '../../realtime-subscriptions/realtime-subscription-lifecycle-observation.store';
import { REALTIME_SUBSCRIPTION_SOURCES } from '../../realtime-subscriptions/realtime-subscription.constants';

let _registered = false;

/**
 * Export lifecycle convergence + allowlist state as OTel observable gauges
 * (declarative-realtime-configuration state layer, design D5). Diagnostics
 * then go through OpenObserve — no HTTP read endpoints are restored.
 * Low-cardinality labels only: source (tdx|qmt) + bounded trigger/result
 * enums; symbols MUST NOT appear as labels (spec R1).
 * Call once after SDK init with DI-resolved service instances. Idempotent.
 */
export function registerSubscriptionLifecycleMetrics(
  observations: RealtimeSubscriptionLifecycleObservationStore,
  allowlist: RealtimeSecurityAllowlistService,
  autoReconcile: () => boolean,
): void {
  if (_registered) {
    return;
  }
  const meter = metrics.getMeter('mist-backend', '0.1.0');

  const health = () =>
    observations.health(autoReconcile() ? 'on' : 'off', new Date());

  type HealthEntry = ReturnType<typeof health>['sources'][number];

  const sourceGauge = (
    name: string,
    description: string,
    pick: (entry: HealthEntry) => number,
  ) => {
    meter.createObservableGauge(name, { description }).addCallback((result) => {
      const bySource = new Map(
        health().sources.map((source) => [source.source, source]),
      );
      for (const source of REALTIME_SUBSCRIPTION_SOURCES) {
        const entry = bySource.get(source);
        result.observe(entry ? pick(entry) : 0, { source });
      }
    });
  };

  sourceGauge(
    'mist_realtime_subscription_desired_count',
    'Desired subscription symbols per source (DB assignments, ACTIVE)',
    (entry) => entry.desiredCount ?? 0,
  );
  sourceGauge(
    'mist_realtime_subscription_active_count',
    'Active subscription symbols per source (provider readback)',
    (entry) => entry.activeCount ?? 0,
  );
  sourceGauge(
    'mist_realtime_subscription_converged_count',
    'Converged assignments per source',
    (entry) => entry.convergedCount ?? 0,
  );
  sourceGauge(
    'mist_realtime_subscription_deferred_removal_count',
    'Assignments awaiting deferred removal per source',
    (entry) => entry.deferredRemovalCount ?? 0,
  );
  sourceGauge(
    'mist_realtime_subscription_last_attempt_age_seconds',
    'Seconds since last reconciliation attempt per source (null = never)',
    (entry) => entry.lastAttemptAgeSeconds ?? -1,
  );
  sourceGauge(
    'mist_realtime_subscription_last_success_age_seconds',
    'Seconds since last successful reconciliation per source (null = never)',
    (entry) => entry.lastSuccessAgeSeconds ?? -1,
  );

  meter
    .createObservableGauge('mist_realtime_subscription_trigger_total', {
      description: 'Reconciliation triggers per source (bounded enum)',
    })
    .addCallback((result) => {
      const bySource = new Map(
        health().sources.map((source) => [source.source, source]),
      );
      for (const source of REALTIME_SUBSCRIPTION_SOURCES) {
        const entry = bySource.get(source);
        for (const { trigger, value } of entry?.triggerTotals ?? []) {
          result.observe(value, { source, trigger });
        }
      }
    });

  meter
    .createObservableGauge('mist_realtime_subscription_result_total', {
      description: 'Reconciliation results per source (bounded enum)',
    })
    .addCallback((result) => {
      const bySource = new Map(
        health().sources.map((source) => [source.source, source]),
      );
      for (const source of REALTIME_SUBSCRIPTION_SOURCES) {
        const entry = bySource.get(source);
        for (const {
          trigger,
          result: resultLabel,
          reason,
          value,
        } of entry?.resultTotals ?? []) {
          result.observe(value, {
            source,
            trigger,
            result: resultLabel,
            reason,
          });
        }
      }
    });

  meter
    .createObservableGauge('mist_realtime_allowlist_assigned_total', {
      description: 'Assigned (DB-declared) allowlist entries per source',
    })
    .addCallback((result) => {
      for (const source of REALTIME_SUBSCRIPTION_SOURCES) {
        result.observe(allowlist.assignedCountFor(source), { source });
      }
    });

  meter
    .createObservableGauge('mist_realtime_allowlist_effective_total', {
      description:
        'Effective (provider-converged) allowlist entries per source',
    })
    .addCallback((result) => {
      for (const source of REALTIME_SUBSCRIPTION_SOURCES) {
        result.observe(allowlist.list(source).length, { source });
      }
    });

  _registered = true;
}
