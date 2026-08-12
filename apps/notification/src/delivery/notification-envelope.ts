import {
  NotificationChannel,
  Security,
  StrategyAlertEvent,
  StrategySignal,
} from '@app/shared-data';

export interface NotificationMessage {
  readonly securityCode: string;
  readonly securityName: string;
  readonly signalKind: string;
  readonly signalTime: string;
  readonly triggerPrice?: number;
  readonly triggerTime?: string;
  readonly summary: string;
}

export interface NotificationEnvelope {
  readonly alertEventId: number;
  readonly dedupeKey: string;
  readonly channel: NotificationChannel;
  readonly message: NotificationMessage;
}

/**
 * Channel-neutral envelope built from persisted Signal/AlertEvent evidence.
 * The notification worker MUST NOT invoke strategy computation; everything the
 * channel needs is derived here from already-committed evidence.
 */
export function buildNotificationEnvelope(
  alertEvent: StrategyAlertEvent,
  signal: StrategySignal | null,
  security: Security | null,
  channel: NotificationChannel,
): NotificationEnvelope {
  const ctx = (signal?.contextSnapshot ?? {}) as Record<string, unknown>;
  const triggerPrice =
    typeof ctx.triggerPrice === 'number' ? ctx.triggerPrice : undefined;
  const triggerTime =
    typeof ctx.triggerTime === 'string' ? ctx.triggerTime : undefined;
  const securityCode =
    security?.code ?? String(signal?.securityId ?? alertEvent.strategySignalId);
  const securityName = security?.name ?? '';
  const signalKind = signal?.signalKind ?? 'unknown';
  const signalTime = signal ? signal.signalTime.toISOString() : '';
  const summary = buildSummary(
    securityCode,
    securityName,
    signalKind,
    signalTime,
    triggerPrice,
  );
  return Object.freeze({
    alertEventId: alertEvent.id,
    dedupeKey: alertEvent.dedupeKey,
    channel,
    message: Object.freeze({
      securityCode,
      securityName,
      signalKind,
      signalTime,
      triggerPrice,
      triggerTime,
      summary,
    }),
  });
}

function buildSummary(
  securityCode: string,
  securityName: string,
  signalKind: string,
  signalTime: string,
  triggerPrice?: number,
): string {
  const name = securityName ? ` ${securityName}` : '';
  const price = triggerPrice !== undefined ? ` @ ${triggerPrice}` : '';
  const time = signalTime ? ` (${signalTime})` : '';
  return `[Mist] ${securityCode}${name} ${signalKind}${price}${time}`;
}
