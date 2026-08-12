/**
 * Port for enqueueing proactive strategy alert delivery (deliver-strategy-notifications).
 * The producer (apps/signal LiveStrategyPersistenceService) calls publish() after the
 * AlertEvent commit; failures are best-effort (Signal already committed).
 */
export const STRATEGY_ALERT_DELIVERY_HANDOFF_PORT = Symbol(
  'STRATEGY_ALERT_DELIVERY_HANDOFF_PORT',
);

export interface StrategyAlertDeliveryHandoffPort {
  publish(alertEventId: number): Promise<void>;
}
