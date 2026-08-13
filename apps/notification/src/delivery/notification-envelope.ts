import {
  NotificationChannel,
  Security,
  StrategyAlertEvent,
  StrategyDefinition,
  StrategySignal,
} from '@app/shared-data';

export interface NotificationMessage {
  readonly securityCode: string;
  readonly securityName: string;
  readonly direction: string;
  readonly triggerPrice?: number;
  readonly strategyName: string;
  readonly periodLabel: string;
  readonly signalTime: string;
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
 * channel needs is derived here from already-committed evidence. Time is rendered
 * in Asia/Shanghai (A-share market local, UTC+8), not the process timezone.
 */
export function buildNotificationEnvelope(
  alertEvent: StrategyAlertEvent,
  signal: StrategySignal | null,
  security: Security | null,
  strategyDefinition: StrategyDefinition | null,
  channel: NotificationChannel,
): NotificationEnvelope {
  const ctx = (signal?.contextSnapshot ?? {}) as Record<string, unknown>;
  const triggerPrice =
    typeof ctx.triggerPrice === 'number' ? ctx.triggerPrice : undefined;
  const securityCode =
    security?.code ?? String(signal?.securityId ?? alertEvent.strategySignalId);
  const securityName = security?.name ?? '';
  const direction = directionLabel(signal?.signalKind);
  const strategyName = strategyDefinition?.name ?? '';
  const periodLabel = signal ? formatPeriod(signal.period) : '';
  const signalTime = signal ? formatShanghaiTime(signal.signalTime) : '';
  const summary = buildSummary({
    securityCode,
    securityName,
    direction,
    triggerPrice,
    strategyName,
    periodLabel,
    signalTime,
  });
  return Object.freeze({
    alertEventId: alertEvent.id,
    dedupeKey: alertEvent.dedupeKey,
    channel,
    message: Object.freeze({
      securityCode,
      securityName,
      direction,
      triggerPrice,
      strategyName,
      periodLabel,
      signalTime,
      summary,
    }),
  });
}

function buildSummary(parts: {
  securityCode: string;
  securityName: string;
  direction: string;
  triggerPrice?: number;
  strategyName: string;
  periodLabel: string;
  signalTime: string;
}): string {
  const name = parts.securityName ? ` ${parts.securityName}` : '';
  const price =
    parts.triggerPrice !== undefined ? ` @ ${parts.triggerPrice}` : '';
  const seg = (...xs: string[]) => xs.filter(Boolean).join(' | ');
  const tail = seg(parts.strategyName, parts.periodLabel, parts.signalTime);
  return `[Mist] ${parts.securityCode}${name} ${parts.direction}${price}${
    tail ? ` | ${tail}` : ''
  }`;
}

function directionLabel(kind: unknown): string {
  if (kind === 'entry') return '买入';
  if (kind === 'exit') return '卖出';
  return String(kind ?? 'signal');
}

function formatPeriod(period: unknown): string {
  if (typeof period !== 'number') return '';
  if (period >= 1440) return period % 1440 === 0 ? '日线' : `${period}m`;
  if (period >= 60) return period % 60 === 0 ? `${period / 60}h` : `${period}m`;
  return `${period}m`;
}

function formatShanghaiTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get(
    'minute',
  )}`;
}
