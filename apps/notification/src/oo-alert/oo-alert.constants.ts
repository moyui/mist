/**
 * OO health-alert queue constants (local to apps/notification — infra alerts
 * do not enter the strategy @app/signal contract).
 */
export const OO_ALERT_QUEUE_NAME = 'oo-alert-delivery';
export const OO_ALERT_BULLMQ_PREFIX = 'oo-alert';
export const OO_ALERT_JOB_TIMEOUT_MS = 15_000;
export const OO_ALERT_WORKER_CONCURRENCY = 1;
export const OO_ALERT_JOB = 'oo_alert';

/** Dedicated WeCom adapter for OO alerts (own bot webhook, OO_ALERT_WECHAT_WEBHOOK). */
export const OO_ALERT_WECHAT_ADAPTER = Symbol('OO_ALERT_WECHAT_ADAPTER');

export type OoAlertSeverity = 'P0' | 'P1' | 'P2';

/**
 * Alert-name prefix → severity mapping (remediate-alert-delivery-integrity L4).
 * Must stay in lockstep with mist-deploy/oo-alerts/rules.json: the sync script
 * validates every rule's name prefix against this same mapping before apply,
 * and the receiver unit test asserts all keys are covered. A7 added by
 * realtime-subscription-restart-recovery (datasource subscription stall).
 */
export const SEVERITY_BY_PREFIX: Readonly<Record<string, OoAlertSeverity>> = {
  A1: 'P0',
  A2: 'P0',
  A3: 'P1',
  A4: 'P1',
  A5: 'P2',
  A6: 'P2',
  A7: 'P1',
};

export interface OoAlertJobV1 {
  readonly alertName: string;
  readonly source?: string;
  readonly severity: OoAlertSeverity;
  readonly ts: string;
  readonly summary: string;
}
