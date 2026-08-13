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

export interface OoAlertJobV1 {
  readonly alertName: string;
  readonly source?: string;
  readonly severity: OoAlertSeverity;
  readonly ts: string;
  readonly summary: string;
}
