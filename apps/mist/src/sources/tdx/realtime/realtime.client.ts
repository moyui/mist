import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import {
  decodeRealtimeNativeMapMessage,
  isRecord,
  parseRealtimeMessage,
  RealtimeNativeMapDecodeError,
} from '../../../realtime/realtime-native-map.decoder';
import {
  RealtimeSubscriptionControl,
  SubscriptionControlFailure,
  SubscriptionControlResult,
} from '../../../realtime/realtime-subscription-control';
import { RealtimeSnapshotIngressService } from '../../../realtime/realtime-snapshot-ingress.service';
import { RealtimeMarketObservabilityService } from '../../../realtime/realtime-market-observability.service';
import { RealtimeQuantityValidationError } from '../../../realtime/realtime-quantity-validation.error';
import { convertTdxNativeSnapshot } from './native-snapshot.converter';
import { TdxRealtimeAllowlistResolver } from './realtime-allowlist.resolver';
import { TdxRealtimeStore } from './realtime.store';

type ControlRequest =
  | { type: 'sync_subscriptions'; symbols: string[] }
  | { type: 'subscribe'; symbol: string }
  | { type: 'unsubscribe'; symbol: string }
  | { type: 'get_subscriptions' };
type ControlResponseType =
  | 'subscriptions_synced'
  | 'subscribed'
  | 'unsubscribed'
  | 'subscriptions';

interface PendingControl {
  expectedType: ControlResponseType;
  symbol: string | null;
  resolve: (value: SubscriptionControlResult) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export const TDX_REALTIME_DESIRED_POSTER = Symbol(
  'TDX_REALTIME_DESIRED_POSTER',
);
export type TdxRealtimeDesiredPoster = (
  endpoint: string,
  symbols: string[],
) => Promise<void>;

@Injectable()
export class TdxRealtimeClient
  implements OnModuleInit, OnModuleDestroy, RealtimeSubscriptionControl
{
  private readonly wsUrl: string;
  private readonly reconnectDelayMs: number;
  private readonly controlTimeoutMs: number;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private shuttingDown = false;
  private transportReady = false;
  private pendingControl: PendingControl | null = null;
  private readonly subscribeAllowlistOnReady: boolean;

  constructor(
    config: ConfigService,
    private readonly store: TdxRealtimeStore,
    private readonly allowlist: TdxRealtimeAllowlistResolver,
    @Optional() desiredPoster?: TdxRealtimeDesiredPoster,
    @Optional()
    private readonly ingress?: RealtimeSnapshotIngressService,
    @Optional()
    private readonly observability?: RealtimeMarketObservabilityService,
  ) {
    const baseUrl =
      config.get<string>('TDX_BASE_URL') ?? 'http://127.0.0.1:9001';
    const clientId =
      config.get<string>('TDX_WS_CLIENT_ID') ?? 'mist-backend-tdx-realtime';
    this.wsUrl = `${baseUrl.replace(/^http/, 'ws')}/ws/realtime/tdx/${clientId}`;
    this.reconnectDelayMs = config.get<number>(
      'TDX_WS_RECONNECT_DELAY_MS',
      5000,
    );
    this.controlTimeoutMs = config.get<number>(
      'TDX_SUBSCRIPTION_CONTROL_TIMEOUT_MS',
      10_000,
    );
    const subscribeAllowlistOnReady = config.get<boolean | string>(
      'TDX_SUBSCRIBE_ALLOWLIST_ON_READY',
      false,
    );
    this.subscribeAllowlistOnReady =
      subscribeAllowlistOnReady === true || subscribeAllowlistOnReady === 'true';
    void desiredPoster;
  }

  onModuleInit(): void {
    this.connect();
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.settleDisconnected();
    this.ws?.close();
  }

  syncSubscriptions(
    symbols: readonly string[],
  ): Promise<SubscriptionControlResult> {
    const normalized = [...new Set(symbols.map(normalizeSymbol))].sort();
    const unauthorized = normalized.find(
      (symbol) => this.allowlist.resolve(symbol) === null,
    );
    if (unauthorized) {
      return Promise.resolve(
        localFailure(unauthorized, 'TDX_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED'),
      );
    }
    return this.executeSubscriptionControl(
      { type: 'sync_subscriptions', symbols: normalized },
      'subscriptions_synced',
      null,
    );
  }

  subscribe(symbol: string): Promise<SubscriptionControlResult> {
    const normalized = normalizeSymbol(symbol);
    if (this.allowlist.resolve(normalized) === null) {
      return Promise.resolve(
        localFailure(normalized, 'TDX_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED'),
      );
    }
    return this.executeSubscriptionControl(
      { type: 'subscribe', symbol: normalized },
      'subscribed',
      normalized,
    );
  }

  unsubscribe(symbol: string): Promise<SubscriptionControlResult> {
    const normalized = normalizeSymbol(symbol);
    if (this.allowlist.resolve(normalized) === null) {
      return Promise.resolve(
        localFailure(normalized, 'TDX_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED'),
      );
    }
    return this.executeSubscriptionControl(
      { type: 'unsubscribe', symbol: normalized },
      'unsubscribed',
      normalized,
    );
  }

  getSubscriptions(): Promise<SubscriptionControlResult> {
    return this.executeSubscriptionControl(
      { type: 'get_subscriptions' },
      'subscriptions',
      null,
    );
  }

  private executeSubscriptionControl(
    request: ControlRequest,
    expectedType: ControlResponseType,
    symbol: string | null,
  ): Promise<SubscriptionControlResult> {
    if (!this.transportReady || this.ws?.readyState !== WebSocket.OPEN) {
      return Promise.resolve(
        localFailure(symbol, 'TDX_SUBSCRIPTION_CONTROL_NOT_READY'),
      );
    }
    if (this.pendingControl) {
      return Promise.resolve(
        localFailure(symbol, 'TDX_SUBSCRIPTION_CONTROL_BUSY'),
      );
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.pendingControl?.resolve !== resolve) return;
        this.pendingControl = null;
        resolve(localFailure(symbol, 'TDX_SUBSCRIPTION_CONTROL_TIMEOUT'));
      }, this.controlTimeoutMs);
      this.pendingControl = { expectedType, symbol, resolve, timeout };
      try {
        this.ws?.send(JSON.stringify(request));
      } catch {
        clearTimeout(timeout);
        this.pendingControl = null;
        resolve(localFailure(symbol, 'TDX_SUBSCRIPTION_CONTROL_SEND_FAILED'));
      }
    });
  }

  private connect(): void {
    if (this.shuttingDown) return;
    this.ws = new WebSocket(this.wsUrl);
    this.ws.on('open', () => {
      this.transportReady = false;
      this.heartbeatTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30_000);
    });
    this.ws.on('message', (data: WebSocket.RawData) => {
      this.handleMessage(data.toString());
    });
    this.ws.on('error', (error) => {
      this.store.setError('TDX_REALTIME_WS_ERROR', error.message);
    });
    this.ws.on('close', () => {
      this.transportReady = false;
      this.store.markDisconnected();
      this.settleDisconnected();
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      if (!this.shuttingDown) {
        this.reconnectTimer = setTimeout(
          () => this.connect(),
          this.reconnectDelayMs,
        );
      }
    });
  }

  private handleMessage(raw: string): void {
    let message: Record<string, unknown>;
    try {
      message = parseRealtimeMessage(raw);
    } catch (error) {
      this.store.recordReject(
        'decodeError',
        null,
        error instanceof Error ? error.message : 'TDX_REALTIME_WS_DECODE_ERROR',
      );
      return;
    }
    if (message['type'] === 'realtime.ready') {
      this.handleReady(message);
      return;
    }
    if (isControlResponseType(message['type'])) {
      this.handleControlResponse(message);
      return;
    }
    if (message['type'] === 'realtime.native_snapshot') {
      this.handleSnapshot(message);
    }
  }

  private handleReady(message: Record<string, unknown>): void {
    const data = message['data'];
    if (
      message['provider'] !== 'tdx' ||
      !isRecord(data) ||
      data['mode'] !== 'builtin' ||
      data['schemaVersion'] !== 2 ||
      data['source'] !== 'TDX' ||
      data['quality'] !== 'latest-state' ||
      !hasExactKeys(data, TDX_READY_DATA_KEYS)
    ) {
      this.store.recordReject(
        'contractMismatch',
        null,
        'TDX_REALTIME_READY_CONTRACT_MISMATCH',
      );
      return;
    }
    this.transportReady = true;
    this.store.markConnected();
    this.store.clearError();
    if (this.subscribeAllowlistOnReady) {
      void this.subscribeConfiguredSymbols();
    }
  }

  private async subscribeConfiguredSymbols(): Promise<void> {
    for (const entry of this.allowlist.entriesList) {
      const result = await this.subscribe(entry.formatCode);
      if ('failure' in result) {
        this.store.setError(
          'TDX_SINGLE_SUBSCRIPTION_FAILED',
          result.failure.reason,
        );
        return;
      }
    }
  }

  private handleSnapshot(message: Record<string, unknown>): void {
    if (!this.transportReady) {
      this.store.recordReject(
        'validationError',
        null,
        'TDX_REALTIME_READY_REQUIRED',
      );
      return;
    }
    let decoded;
    try {
      decoded = decodeRealtimeNativeMapMessage(message, 'tdx');
    } catch (error) {
      this.store.recordReject(
        error instanceof RealtimeNativeMapDecodeError
          ? 'contractMismatch'
          : 'decodeError',
        null,
        error instanceof Error ? error.message : 'TDX_REALTIME_FRAME_INVALID',
      );
      return;
    }
    const [providerSymbol, value] = Object.entries(decoded.data.native)[0];
    if (!TDX_SYMBOL_PATTERN.test(providerSymbol) || !isRecord(value)) {
      this.store.recordReject(
        'validationError',
        providerSymbol,
        'TDX_REALTIME_NATIVE_INVALID',
      );
      return;
    }
    const allowlistEntry = this.allowlist.resolve(providerSymbol);
    if (!allowlistEntry) {
      this.store.recordReject(
        'symbolNotAuthorized',
        providerSymbol,
        'TDX_REALTIME_SYMBOL_NOT_AUTHORIZED',
      );
      return;
    }
    try {
      const snapshot = convertTdxNativeSnapshot({
        securityId: allowlistEntry.securityId,
        providerSymbol,
        capturedAt: decoded.data.capturedAt,
        native: value,
      });
      this.ingress?.handleSnapshot(snapshot);
      this.store.recordAccepted(decoded.data.capturedAt);
    } catch (error) {
      if (error instanceof RealtimeQuantityValidationError) {
        this.observability?.recordQuantityRejection(
          error.source,
          error.field,
          error.reason,
        );
      }
      this.store.recordReject(
        'converterError',
        providerSymbol,
        'TDX_REALTIME_CONVERTER_FAILED',
      );
    }
  }

  private handleControlResponse(message: Record<string, unknown>): void {
    const pending = this.pendingControl;
    if (
      !pending ||
      !hasExactKeys(message, CONTROL_RESPONSE_OUTER_KEYS) ||
      message['provider'] !== 'tdx' ||
      message['type'] !== pending.expectedType ||
      !isRfc3339(message['timestamp']) ||
      !isRecord(message['data'])
    ) {
      this.store.recordReject(
        'controlResponseRejected',
        null,
        'TDX_SUBSCRIPTION_CONTROL_RESPONSE_REJECTED',
      );
      return;
    }
    const result = decodeControlResult(message['data']);
    if (!result) {
      this.store.recordReject(
        'controlResponseRejected',
        pending.symbol,
        'TDX_SUBSCRIPTION_CONTROL_RESPONSE_INVALID',
      );
      return;
    }
    clearTimeout(pending.timeout);
    this.pendingControl = null;
    pending.resolve(result);
  }

  private settleDisconnected(): void {
    const pending = this.pendingControl;
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingControl = null;
    pending.resolve(
      localFailure(pending.symbol, 'TDX_SUBSCRIPTION_CONTROL_DISCONNECTED'),
    );
  }
}

function decodeControlResult(
  data: Record<string, unknown>,
): SubscriptionControlResult | null {
  const keys = Object.keys(data);
  if (keys.length !== 1) return null;
  if (keys[0] === 'success') return { success: data['success'] };
  if (keys[0] !== 'failure' || !isRecord(data['failure'])) return null;
  const failure = data['failure'];
  const failureKeys = Object.keys(failure);
  if (
    (failureKeys.length !== 2 && failureKeys.length !== 3) ||
    !failureKeys.every((key) =>
      ['symbol', 'reason', 'subscriptionState'].includes(key),
    ) ||
    (typeof failure['symbol'] !== 'string' && failure['symbol'] !== null) ||
    typeof failure['reason'] !== 'string' ||
    (failureKeys.length === 3 &&
      failure['subscriptionState'] !== 'subscribed' &&
      failure['subscriptionState'] !== 'unknown')
  ) {
    return null;
  }
  return { failure: failure as unknown as SubscriptionControlFailure };
}

function isControlResponseType(value: unknown): value is ControlResponseType {
  return (
    value === 'subscriptions_synced' ||
    value === 'subscribed' ||
    value === 'unsubscribed' ||
    value === 'subscriptions'
  );
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function localFailure(
  symbol: string | null,
  reason: string,
): SubscriptionControlResult {
  return { failure: { symbol, reason } };
}

const TDX_SYMBOL_PATTERN = /^(?:\d{6}\.(?:SH|SZ|BJ)|\d{5,6}\.HK)$/;
const CONTROL_RESPONSE_OUTER_KEYS = [
  'type',
  'provider',
  'data',
  'timestamp',
] as const;
const TDX_READY_DATA_KEYS = [
  'mode',
  'schemaVersion',
  'source',
  'quality',
] as const;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

function isRfc3339(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    RFC3339_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
