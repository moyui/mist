import {
  NotificationChannel,
  Security,
  StrategyAlertEvent,
  StrategyDefinition,
  StrategySignal,
} from '@app/shared-data';
import { ASIA_SHANGHAI_TIMEZONE } from '@app/timezone';

export interface NotificationMessage {
  readonly securityCode: string;
  readonly securityName: string;
  readonly direction: string;
  readonly triggerPrice?: number;
  readonly strategyName: string;
  readonly periodLabel: string;
  readonly signalTime: string;
  readonly summary: string;
  readonly confidence?: number;
  readonly confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  readonly reason?: string;
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
  const direction = directionLabel(signal?.signalKind, ctx);
  const strategyName = strategyDefinition?.name ?? '';
  const periodLabel = signal ? formatPeriod(signal.period) : '';
  const signalTime = signal ? formatShanghaiTime(signal.signalTime) : '';
  const confidence =
    signal?.confidence !== null && signal?.confidence !== undefined
      ? Number(signal.confidence)
      : undefined;
  const confidenceLevel = signal?.confidenceLevel ?? undefined;
  const reason = (signal?.decisionTrace as any)?.summary;

  const summary = buildSummary({
    securityCode,
    securityName,
    direction,
    triggerPrice,
    strategyName,
    periodLabel,
    signalTime,
    confidence,
    confidenceLevel,
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
      confidence,
      confidenceLevel,
      reason,
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
  confidence?: number;
  confidenceLevel?: string;
}): string {
  const name = parts.securityName ? ` ${parts.securityName}` : '';
  const price =
    parts.triggerPrice !== undefined ? ` @ ${parts.triggerPrice}` : '';
  const conf =
    parts.confidence !== undefined
      ? ` [${parts.confidenceLevel ?? 'CONF'} ${parts.confidence.toFixed(1)}%]`
      : '';
  const seg = (...xs: string[]) => xs.filter(Boolean).join(' | ');
  const tail = seg(parts.strategyName, parts.periodLabel, parts.signalTime);
  return `[Mist]${conf} ${parts.securityCode}${name} ${parts.direction}${price}${
    tail ? ` | ${tail}` : ''
  }`;
}

const CHAN_BSP_TYPE_NAMES: Record<string, string> = {
  first_buy: '一买',
  second_buy: '二买',
  third_buy: '三买',
  first_sell: '一卖',
  second_sell: '二卖',
  third_sell: '三卖',
};

function directionLabel(kind: unknown, ctx?: Record<string, unknown>): string {
  const chanBsp = ctx?.chanBsp as Record<string, unknown> | undefined;
  if (chanBsp && typeof chanBsp.type === 'string') {
    const typeName = CHAN_BSP_TYPE_NAMES[chanBsp.type] ?? chanBsp.type;
    const unitLabel = chanBsp.units === 'duan' ? '段级' : '笔级';
    return `${typeName} (${unitLabel})`;
  }
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
    timeZone: ASIA_SHANGHAI_TIMEZONE,
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
