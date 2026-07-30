import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

import {
  K,
  KExtensionEf,
  KExtensionQmt,
  KExtensionTdx,
  Security,
  SecuritySourceConfig,
} from '@app/shared-data';
import { mistEnvSchema } from '@app/config';
import { DynamicModule, Module, Type } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { QmtRealtimeClient } from '../../sources/qmt/realtime/realtime.client';
import { QmtRealtimeAllowlistResolver } from '../../sources/qmt/realtime/realtime-allowlist.resolver';
import { QmtRealtimeStore } from '../../sources/qmt/realtime/realtime.store';
import { TdxRealtimeClient } from '../../sources/tdx/realtime/realtime.client';
import { TdxRealtimeAllowlistResolver } from '../../sources/tdx/realtime/realtime-allowlist.resolver';
import { TdxRealtimeStore } from '../../sources/tdx/realtime/realtime.store';
import { RealtimeIngressModule } from '../realtime-ingress.module';
import { CanonicalRealtimeSnapshot } from '../realtime.types';
import { RealtimeSnapshotIngressService } from '../realtime-snapshot-ingress.service';
import { RealtimeSubscriptionControl } from '../realtime-subscription-control';
import { SubscriptionControlResult } from '../realtime-subscription-control';

export type HilSource = 'tdx' | 'qmt';

interface HilOperationEvidence {
  operation: string;
  result: 'success' | 'failure';
  reason: string;
  success?: unknown;
  subscriptionState?: 'subscribed' | 'unknown';
}

interface HilEvidence {
  source: HilSource;
  symbol: string;
  overlaySymbol: string;
  rawFixtureSymbol: string | null;
  rawFixtureSha256: string | null;
  formalFixtureSha256: string;
  capturedRawFixtures: CapturedRawFixtureEvidence[];
  qmtLifecycleObservation: QmtLifecycleObservation | null;
  operations: HilOperationEvidence[];
  cleanupAttempted: boolean;
}

interface CapturedRawFixtureEvidence {
  phase: 'whole' | 'overlay' | 'replacement';
  symbol: string;
  capturedAt: string;
  fileName: string;
  sha256: string;
  canonicalReadback: CanonicalReadbackEvidence;
}

export interface QmtLifecycleObservation {
  callbackObservationWindowMs: number;
  callbackCapturedAtBefore: string | null;
  callbackCapturedAtAfter: string | null;
  callbackStoppedDuringWindow: boolean;
  releasedSubscriptionId: number | null;
  laterSubscriptionId: number | null;
  laterIdReused: boolean | null;
  replacementSubscriptionSucceeded: boolean;
  quotaReleaseEvidence:
    | 'replacement_subscription_succeeded'
    | 'replacement_subscription_failed';
  runtimeActiveSubscriptionObservation: 'platform_unavailable';
}

export interface CanonicalReadbackEvidence {
  source: HilSource;
  securityId: number;
  providerSymbol: string;
  eventTime: string | null;
  capturedAt: string;
  quality: CanonicalRealtimeSnapshot['quality'];
}

interface HilRunOptions {
  source: HilSource;
  symbol: string;
  overlaySymbol: string;
  rawFixturePath?: string;
  rawCaptureDirectory?: string;
  snapshotTimeoutMs?: number;
  qmtCallbackObservationMs?: number;
}

interface DualSourceSoakOptions {
  tdxSymbol: string;
  qmtSymbol: string;
  durationMs: number;
  intervalMs: number;
  maxSnapshotAgeMs: number;
  qmtStateDirectory?: string;
  tdxBridgeHealthUrl: string;
  qmtBridgeHealthUrl: string;
}

interface DualSourceSoakSample {
  observedAt: string;
  tdx: CanonicalReadbackEvidence;
  qmt: CanonicalReadbackEvidence;
  tdxSnapshotAgeMs: number;
  qmtSnapshotAgeMs: number;
  tdxBridge: Record<string, unknown>;
  qmtBridge: Record<string, unknown>;
  qmtJournalFingerprintSha256: string | null;
}

type CapturePhase = CapturedRawFixtureEvidence['phase'];

@Module({})
class RealtimeSubscriptionHilModule {}

export const realtimeSubscriptionHilEntities = [
  K,
  KExtensionEf,
  KExtensionQmt,
  KExtensionTdx,
  Security,
  SecuritySourceConfig,
] as const;

export async function runRealtimeSubscriptionHil({
  source,
  symbol: requestedSymbol,
  overlaySymbol: requestedOverlaySymbol,
  rawFixturePath,
  rawCaptureDirectory,
  snapshotTimeoutMs = 30_000,
  qmtCallbackObservationMs = 10_000,
}: HilRunOptions): Promise<HilEvidence> {
  const symbol = normalizeHilSymbol(requestedSymbol);
  const overlaySymbol = normalizeHilSymbol(requestedOverlaySymbol);
  if (symbol === overlaySymbol) {
    throw new Error('HIL whole and overlay symbols must be different');
  }
  const rawFixtureSymbol = rawFixturePath
    ? requireMatchingRawFixtureSymbol(rawFixturePath, symbol)
    : null;
  const context = await NestFactory.createApplicationContext(
    createHilModule(source),
    { logger: ['error', 'warn'] },
  );
  const operations: HilEvidence['operations'] = [];
  const capturedRawFixtures: CapturedRawFixtureEvidence[] = [];
  let qmtLifecycleObservation: QmtLifecycleObservation | null = null;
  let cleanupAttempted = false;
  try {
    const resolved = resolveClient(source, context);
    const { client, ready } = resolved;
    await waitUntilReady(ready, 30_000);
    operations.push(
      ...(await runControlSequence(
        client,
        source,
        symbol,
        overlaySymbol,
        rawCaptureDirectory
          ? async (phase, captureSymbol, notBeforeMs) => {
              capturedRawFixtures.push(
                await captureRawFixture(
                  source,
                  phase,
                  captureSymbol,
                  rawCaptureDirectory,
                  resolved,
                  snapshotTimeoutMs,
                  notBeforeMs,
                ),
              );
            }
          : undefined,
        source === 'qmt'
          ? {
              observationWindowMs: qmtCallbackObservationMs,
              readCapturedAt: () => {
                const securityId = resolved.resolveSecurityId(overlaySymbol);
                if (securityId === null) return null;
                return resolved.readLatest(securityId)?.capturedAt ?? null;
              },
              onObservation: (observation) => {
                qmtLifecycleObservation = observation;
              },
            }
          : undefined,
      )),
    );
  } catch {
    operations.push({
      operation: 'harness.initialize',
      result: 'failure',
      reason: 'HIL_INITIALIZATION_FAILED',
    });
  } finally {
    cleanupAttempted = true;
    const client = resolveClient(source, context).client;
    await recordOperation(operations, 'syncSubscriptions.cleanup', () =>
      client.syncSubscriptions([]),
    );
    await recordOperation(operations, 'getSubscriptions.afterCleanup', () =>
      client.getSubscriptions(),
    );
    await context.close();
  }
  const formalFixturePath = resolve(
    process.cwd(),
    'test/fixtures/realtime/realtime-native-frame-v2.json',
  );
  return {
    source,
    symbol,
    overlaySymbol,
    rawFixtureSymbol,
    rawFixtureSha256: rawFixturePath ? sha256(rawFixturePath) : null,
    formalFixtureSha256: sha256(formalFixturePath),
    capturedRawFixtures,
    qmtLifecycleObservation,
    operations,
    cleanupAttempted,
  };
}

export function requireMatchingRawFixtureSymbol(
  rawFixturePath: string,
  expectedSymbol: string,
): string {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(rawFixturePath, 'utf8')) as unknown;
  } catch {
    throw new Error('HIL raw fixture must be valid JSON');
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('symbol' in value) ||
    typeof value.symbol !== 'string'
  ) {
    throw new Error('HIL raw fixture must contain a top-level symbol');
  }
  const fixtureSymbol = value.symbol.trim().toUpperCase();
  const requestedSymbol = expectedSymbol.trim().toUpperCase();
  if (!fixtureSymbol || fixtureSymbol !== requestedSymbol) {
    throw new Error(
      `HIL raw fixture symbol ${fixtureSymbol || '<empty>'} does not match requested symbol ${requestedSymbol}`,
    );
  }
  return fixtureSymbol;
}

function createHilModule(source: HilSource): DynamicModule {
  const sourceProviders: Type[] =
    source === 'qmt'
      ? [QmtRealtimeAllowlistResolver, QmtRealtimeClient, QmtRealtimeStore]
      : [TdxRealtimeAllowlistResolver, TdxRealtimeClient, TdxRealtimeStore];
  return {
    module: RealtimeSubscriptionHilModule,
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        validationSchema: mistEnvSchema,
        validationOptions: { allowUnknown: true, abortEarly: false },
      }),
      TypeOrmModule.forRootAsync({
        useFactory(config: ConfigService) {
          return {
            type: 'mysql',
            host: config.get('mysql_server_host'),
            port: config.get('mysql_server_port'),
            username: config.get('mysql_server_username'),
            password: config.get('mysql_server_password'),
            database: config.get('mysql_server_database'),
            timezone: '+08:00',
            synchronize: false,
            logging: false,
            entities: [...realtimeSubscriptionHilEntities],
            connectorPackage: 'mysql2',
          };
        },
        inject: [ConfigService],
      }),
      RealtimeIngressModule,
    ],
    providers: sourceProviders,
  };
}

function createDualSourceHilModule(): DynamicModule {
  return {
    module: RealtimeSubscriptionHilModule,
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        validationSchema: mistEnvSchema,
        validationOptions: { allowUnknown: true, abortEarly: false },
      }),
      TypeOrmModule.forRootAsync({
        useFactory(config: ConfigService) {
          return {
            type: 'mysql',
            host: config.get('mysql_server_host'),
            port: config.get('mysql_server_port'),
            username: config.get('mysql_server_username'),
            password: config.get('mysql_server_password'),
            database: config.get('mysql_server_database'),
            timezone: '+08:00',
            synchronize: false,
            logging: false,
            entities: [...realtimeSubscriptionHilEntities],
            connectorPackage: 'mysql2',
          };
        },
        inject: [ConfigService],
      }),
      RealtimeIngressModule,
    ],
    providers: [
      QmtRealtimeAllowlistResolver,
      QmtRealtimeClient,
      QmtRealtimeStore,
      TdxRealtimeAllowlistResolver,
      TdxRealtimeClient,
      TdxRealtimeStore,
    ],
  };
}

function resolveClient(
  source: HilSource,
  context: {
    get<TInput = unknown, TResult = TInput>(
      typeOrToken: Type<TInput>,
      options?: { strict: boolean },
    ): TResult;
  },
): {
  client: RealtimeSubscriptionControl;
  ready: () => boolean;
  resolveSecurityId: (providerSymbol: string) => number | null;
  readLatest: (securityId: number) => CanonicalRealtimeSnapshot | null;
} {
  const ingress = context.get(RealtimeSnapshotIngressService, {
    strict: false,
  });
  if (source === 'qmt') {
    const resolver = context.get(QmtRealtimeAllowlistResolver, {
      strict: false,
    });
    return {
      client: context.get(QmtRealtimeClient, { strict: false }),
      ready: () =>
        context.get(QmtRealtimeStore, { strict: false }).status()
          .transportReady,
      resolveSecurityId: (providerSymbol) =>
        resolver.resolve(providerSymbol)?.securityId ?? null,
      readLatest: (securityId) => ingress.read(securityId),
    };
  }
  const resolver = context.get(TdxRealtimeAllowlistResolver, {
    strict: false,
  });
  return {
    client: context.get(TdxRealtimeClient, { strict: false }),
    ready: () =>
      context.get(TdxRealtimeStore, { strict: false }).status().transportReady,
    resolveSecurityId: (providerSymbol) =>
      resolver.resolve(providerSymbol)?.securityId ?? null,
    readLatest: (securityId) => ingress.read(securityId),
  };
}

export async function runControlSequence(
  client: RealtimeSubscriptionControl,
  source: HilSource,
  symbol: string,
  overlaySymbol: string,
  capture?: (
    phase: CapturePhase,
    symbol: string,
    notBeforeMs: number,
  ) => Promise<void>,
  qmtLifecycle?: {
    observationWindowMs: number;
    readCapturedAt: () => string | null;
    onObservation?: (observation: QmtLifecycleObservation) => void;
  },
): Promise<HilOperationEvidence[]> {
  const operations: HilOperationEvidence[] = [];
  await recordOperation(operations, 'getSubscriptions.before', () =>
    client.getSubscriptions(),
  );
  const syncStartedAt = Date.now();
  const syncResult = await recordOperation(
    operations,
    'syncSubscriptions.target',
    () => client.syncSubscriptions([symbol]),
  );
  if (capture) {
    await recordCapture(operations, 'captureRawFixture.whole', syncResult, () =>
      capture('whole', symbol, syncStartedAt),
    );
  }
  await recordOperation(operations, 'getSubscriptions.afterSync', () =>
    client.getSubscriptions(),
  );
  const subscribeStartedAt = Date.now();
  const subscribeResult = await recordOperation(
    operations,
    'subscribe.overlay',
    () => client.subscribe(overlaySymbol),
  );
  if (capture) {
    await recordCapture(
      operations,
      'captureRawFixture.overlay',
      subscribeResult,
      () => capture('overlay', overlaySymbol, subscribeStartedAt),
    );
  }
  await recordOperation(operations, 'getSubscriptions.afterSubscribe', () =>
    client.getSubscriptions(),
  );
  const releasedSubscriptionId = successfulInteger(
    operations,
    'subscribe.overlay',
  );
  await recordOperation(operations, 'unsubscribe.overlay', () =>
    client.unsubscribe(overlaySymbol),
  );
  if (source === 'tdx') {
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await recordOperation(
        operations,
        `getSubscriptions.afterUnsubscribe.cycle${cycle}`,
        () => client.getSubscriptions(),
      );
    }
  } else {
    await recordOperation(operations, 'getSubscriptions.afterUnsubscribe', () =>
      client.getSubscriptions(),
    );
    if (qmtLifecycle) {
      const callbackCapturedAtBefore = qmtLifecycle.readCapturedAt();
      await delay(qmtLifecycle.observationWindowMs);
      const callbackCapturedAtAfter = qmtLifecycle.readCapturedAt();
      const callbackStoppedDuringWindow =
        callbackCapturedAtBefore === callbackCapturedAtAfter;
      operations.push({
        operation: 'observeCallbackCessation.overlay',
        result: callbackStoppedDuringWindow ? 'success' : 'failure',
        reason: callbackStoppedDuringWindow
          ? 'none'
          : 'HIL_QMT_CALLBACK_CONTINUED_AFTER_UNSUBSCRIBE',
      });

      const replacementStartedAt = Date.now();
      const replacementResult = await recordOperation(
        operations,
        'subscribe.overlayReplacement',
        () => client.subscribe(overlaySymbol),
      );
      if (capture) {
        await recordCapture(
          operations,
          'captureRawFixture.replacement',
          replacementResult,
          () => capture('replacement', overlaySymbol, replacementStartedAt),
        );
      }
      await recordOperation(
        operations,
        'getSubscriptions.afterReplacementSubscribe',
        () => client.getSubscriptions(),
      );
      const laterSubscriptionId = successfulInteger(
        operations,
        'subscribe.overlayReplacement',
      );
      const replacementSubscriptionSucceeded =
        laterSubscriptionId !== null &&
        successfulValue(
          operations,
          'getSubscriptions.afterReplacementSubscribe',
        ) !== undefined;
      const qmtLifecycleObservation: QmtLifecycleObservation = {
        callbackObservationWindowMs: qmtLifecycle.observationWindowMs,
        callbackCapturedAtBefore,
        callbackCapturedAtAfter,
        callbackStoppedDuringWindow,
        releasedSubscriptionId,
        laterSubscriptionId,
        laterIdReused:
          releasedSubscriptionId === null || laterSubscriptionId === null
            ? null
            : releasedSubscriptionId === laterSubscriptionId,
        replacementSubscriptionSucceeded,
        quotaReleaseEvidence: replacementSubscriptionSucceeded
          ? 'replacement_subscription_succeeded'
          : 'replacement_subscription_failed',
        runtimeActiveSubscriptionObservation: 'platform_unavailable',
      };
      qmtLifecycle.onObservation?.(qmtLifecycleObservation);
      operations.push({
        operation: 'classifyQmtQuotaAndIdReuse',
        result:
          callbackStoppedDuringWindow && replacementSubscriptionSucceeded
            ? 'success'
            : 'failure',
        reason:
          callbackStoppedDuringWindow && replacementSubscriptionSucceeded
            ? 'none'
            : 'HIL_QMT_LIFECYCLE_CLASSIFICATION_FAILED',
        success: qmtLifecycleObservation,
      });
      await recordOperation(operations, 'unsubscribe.overlayReplacement', () =>
        client.unsubscribe(overlaySymbol),
      );
      await recordOperation(
        operations,
        'getSubscriptions.afterReplacementCleanup',
        () => client.getSubscriptions(),
      );
    }
  }
  operations.push(
    validateSubscriptionState(source, symbol, overlaySymbol, operations),
  );
  return operations;
}

async function captureRawFixture(
  source: HilSource,
  phase: CapturePhase,
  symbol: string,
  outputDirectory: string,
  resolved: ReturnType<typeof resolveClient>,
  timeoutMs: number,
  notBeforeMs: number,
): Promise<CapturedRawFixtureEvidence> {
  const securityId = resolved.resolveSecurityId(symbol);
  if (securityId === null) {
    throw new Error('HIL raw capture symbol is not authorized');
  }
  const deadline = Date.now() + timeoutMs;
  let snapshot = resolved.readLatest(securityId);
  while (
    !snapshot ||
    !Number.isFinite(Date.parse(snapshot.capturedAt)) ||
    Date.parse(snapshot.capturedAt) < notBeforeMs
  ) {
    if (Date.now() >= deadline) {
      throw new Error('HIL raw capture timed out');
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    snapshot = resolved.readLatest(securityId);
  }
  if (snapshot.source !== source || snapshot.providerSymbol !== symbol) {
    throw new Error('HIL raw capture identity mismatch');
  }
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const fileName = `${source}-${phase}-${symbol.replace(/[^A-Z0-9._-]/g, '_')}.json`;
  const path = join(outputDirectory, fileName);
  const serialized =
    JSON.stringify(
      {
        source,
        captureKind: phase === 'whole' ? 'whole-callback' : 'single-callback',
        symbol,
        capturedAt: snapshot.capturedAt,
        nativePayload: { [symbol]: snapshot.native },
      },
      null,
      2,
    ) + '\n';
  writeFileSync(path, serialized, { encoding: 'utf8', mode: 0o600 });
  return {
    phase,
    symbol,
    capturedAt: snapshot.capturedAt,
    fileName: basename(path),
    sha256: createHash('sha256').update(serialized).digest('hex'),
    canonicalReadback: toCanonicalReadbackEvidence(snapshot),
  };
}

export function toCanonicalReadbackEvidence(
  snapshot: CanonicalRealtimeSnapshot,
): CanonicalReadbackEvidence {
  return {
    source: snapshot.source,
    securityId: snapshot.securityId,
    providerSymbol: snapshot.providerSymbol,
    eventTime: snapshot.eventTime,
    capturedAt: snapshot.capturedAt,
    quality: { ...snapshot.quality },
  };
}

function validateSubscriptionState(
  source: HilSource,
  symbol: string,
  overlaySymbol: string,
  operations: HilOperationEvidence[],
): HilOperationEvidence {
  const afterSync = successfulValue(operations, 'getSubscriptions.afterSync');
  const afterSubscribe = successfulValue(
    operations,
    'getSubscriptions.afterSubscribe',
  );
  const afterUnsubscribe =
    source === 'tdx'
      ? [1, 2, 3].map((cycle) =>
          successfulValue(
            operations,
            `getSubscriptions.afterUnsubscribe.cycle${cycle}`,
          ),
        )
      : successfulValue(operations, 'getSubscriptions.afterUnsubscribe');
  const afterReplacementCleanup = successfulValue(
    operations,
    'getSubscriptions.afterReplacementCleanup',
  );
  const valid =
    source === 'qmt'
      ? isQmtState(afterSync, symbol, []) &&
        isQmtState(afterSubscribe, symbol, [overlaySymbol]) &&
        isQmtState(afterUnsubscribe, symbol, []) &&
        (afterReplacementCleanup === undefined ||
          isQmtState(afterReplacementCleanup, symbol, []))
      : isTdxState(afterSync, [symbol]) &&
        isTdxState(afterSubscribe, [symbol, overlaySymbol]) &&
        Array.isArray(afterUnsubscribe) &&
        afterUnsubscribe.length === 3 &&
        afterUnsubscribe.every((state) => isTdxState(state, [symbol]));
  return valid
    ? {
        operation: 'validateSubscriptions.exactState',
        result: 'success',
        reason: 'none',
      }
    : {
        operation: 'validateSubscriptions.exactState',
        result: 'failure',
        reason: 'HIL_SUBSCRIPTION_STATE_INVALID',
      };
}

function successfulInteger(
  operations: HilOperationEvidence[],
  operation: string,
): number | null {
  const value = successfulValue(operations, operation);
  return Number.isInteger(value) ? (value as number) : null;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

function successfulValue(
  operations: HilOperationEvidence[],
  operation: string,
): unknown {
  const evidence = operations.find((item) => item.operation === operation);
  return evidence?.result === 'success' ? evidence.success : undefined;
}

function isQmtState(
  value: unknown,
  wholeSymbol: string,
  expectedSingles: string[],
): boolean {
  if (!value || typeof value !== 'object') return false;
  const state = value as { whole?: unknown; singles?: unknown };
  if (!state.whole || typeof state.whole !== 'object') return false;
  const whole = state.whole as { subId?: unknown; symbols?: unknown };
  if (
    !Number.isInteger(whole.subId) ||
    !sameSymbols(whole.symbols, [wholeSymbol]) ||
    !state.singles ||
    typeof state.singles !== 'object' ||
    Array.isArray(state.singles)
  ) {
    return false;
  }
  const singles = state.singles as Record<string, unknown>;
  return (
    sameSymbols(Object.keys(singles), expectedSingles) &&
    Object.values(singles).every((subId) => Number.isInteger(subId))
  );
}

function isTdxState(value: unknown, expectedSymbols: string[]): boolean {
  return sameSymbols(value, expectedSymbols);
}

function sameSymbols(value: unknown, expectedSymbols: string[]): boolean {
  if (
    !Array.isArray(value) ||
    !value.every((symbol) => typeof symbol === 'string')
  ) {
    return false;
  }
  return (
    [...value].sort().join('\n') === [...expectedSymbols].sort().join('\n')
  );
}

async function recordCapture(
  operations: HilOperationEvidence[],
  operation: string,
  prerequisite: HilOperationEvidence,
  capture: () => Promise<void>,
): Promise<void> {
  if (prerequisite.result === 'failure') {
    operations.push({
      operation,
      result: 'failure',
      reason: 'HIL_RAW_CAPTURE_PREREQUISITE_FAILED',
    });
    return;
  }
  try {
    await capture();
    operations.push({ operation, result: 'success', reason: 'none' });
  } catch {
    operations.push({
      operation,
      result: 'failure',
      reason: 'HIL_RAW_CAPTURE_FAILED',
    });
  }
}

function normalizeHilSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized || !/^[A-Z0-9._-]+$/.test(normalized)) {
    throw new Error('HIL symbol must contain only provider-symbol characters');
  }
  return normalized;
}

async function waitUntilReady(
  ready: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() >= deadline) {
      throw new Error(
        'HIL provider client did not become ready before timeout',
      );
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
}

async function recordOperation(
  operations: HilOperationEvidence[],
  operation: string,
  invoke: () => Promise<SubscriptionControlResult>,
): Promise<HilOperationEvidence> {
  let evidence: HilOperationEvidence;
  try {
    evidence = summarize(operation, await invoke());
  } catch {
    evidence = {
      operation,
      result: 'failure',
      reason: 'HIL_OPERATION_THROWN',
    };
  }
  operations.push(evidence);
  return evidence;
}

function summarize(
  operation: string,
  result: SubscriptionControlResult,
): HilOperationEvidence {
  if ('success' in result) {
    return {
      operation,
      result: 'success',
      reason: 'none',
      success: result.success,
    };
  }
  return {
    operation,
    result: 'failure',
    reason: result.failure.reason,
    ...(result.failure.subscriptionState
      ? { subscriptionState: result.failure.subscriptionState }
      : {}),
  };
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export async function runRealtimeDualSourceSoakHil({
  tdxSymbol: requestedTdxSymbol,
  qmtSymbol: requestedQmtSymbol,
  durationMs,
  intervalMs,
  maxSnapshotAgeMs,
  qmtStateDirectory,
  tdxBridgeHealthUrl,
  qmtBridgeHealthUrl,
}: DualSourceSoakOptions): Promise<Record<string, unknown>> {
  const tdxSymbol = normalizeHilSymbol(requestedTdxSymbol);
  const qmtSymbol = normalizeHilSymbol(requestedQmtSymbol);
  const context = await NestFactory.createApplicationContext(
    createDualSourceHilModule(),
    { logger: ['error', 'warn'] },
  );
  const operations: HilOperationEvidence[] = [];
  const samples: DualSourceSoakSample[] = [];
  let qmtJournalBaseline: string | null = null;
  let cleanupAttempted = false;
  const startedAt = new Date().toISOString();
  try {
    const tdx = resolveClient('tdx', context);
    const qmt = resolveClient('qmt', context);
    await Promise.all([
      waitUntilReady(tdx.ready, 30_000),
      waitUntilReady(qmt.ready, 30_000),
    ]);
    const setupStartedAt = Date.now();
    await recordOperation(operations, 'tdx.syncSubscriptions.soakTarget', () =>
      tdx.client.syncSubscriptions([tdxSymbol]),
    );
    await recordOperation(operations, 'qmt.syncSubscriptions.soakTarget', () =>
      qmt.client.syncSubscriptions([qmtSymbol]),
    );
    await waitForFreshCanonicalSnapshot(
      tdx,
      'tdx',
      tdxSymbol,
      setupStartedAt,
      90_000,
    );
    await waitForFreshCanonicalSnapshot(
      qmt,
      'qmt',
      qmtSymbol,
      setupStartedAt,
      90_000,
    );
    qmtJournalBaseline = fingerprintQmtJournal(qmtStateDirectory);
    const deadline = Date.now() + durationMs;
    do {
      const observedAtMs = Date.now();
      const tdxSnapshot = requireCurrentSnapshot(tdx, 'tdx', tdxSymbol);
      const qmtSnapshot = requireCurrentSnapshot(qmt, 'qmt', qmtSymbol);
      const tdxSnapshotAgeMs =
        observedAtMs - requireCapturedAtMs(tdxSnapshot.capturedAt);
      const qmtSnapshotAgeMs =
        observedAtMs - requireCapturedAtMs(qmtSnapshot.capturedAt);
      if (
        tdxSnapshotAgeMs < -5_000 ||
        tdxSnapshotAgeMs > maxSnapshotAgeMs ||
        qmtSnapshotAgeMs < -5_000 ||
        qmtSnapshotAgeMs > maxSnapshotAgeMs
      ) {
        throw new Error('HIL dual-source snapshot freshness exceeded bound');
      }
      const currentJournal = fingerprintQmtJournal(qmtStateDirectory);
      if (currentJournal !== qmtJournalBaseline) {
        throw new Error(
          'HIL QMT journal changed during mutation-free dual-source soak',
        );
      }
      const tdxBridge = await readBridgeHealth(tdxBridgeHealthUrl, 'tdx');
      const qmtBridge = await readBridgeHealth(qmtBridgeHealthUrl, 'qmt');
      if (samples.length > 0) {
        const baseline = samples[0];
        if (
          tdxBridge.ownerId !== baseline.tdxBridge.ownerId ||
          tdxBridge.bridgeBuildId !== baseline.tdxBridge.bridgeBuildId ||
          qmtBridge.ownerId !== baseline.qmtBridge.ownerId ||
          qmtBridge.bridgeBuildId !== baseline.qmtBridge.bridgeBuildId
        ) {
          throw new Error('HIL bridge owner or build changed during soak');
        }
      }
      if (
        'desiredRevision' in tdxBridge &&
        'convergedRevision' in tdxBridge &&
        tdxBridge.desiredRevision !== tdxBridge.convergedRevision
      ) {
        throw new Error('HIL TDX desired/converged revision drifted');
      }
      samples.push({
        observedAt: new Date(observedAtMs).toISOString(),
        tdx: toCanonicalReadbackEvidence(tdxSnapshot),
        qmt: toCanonicalReadbackEvidence(qmtSnapshot),
        tdxSnapshotAgeMs,
        qmtSnapshotAgeMs,
        tdxBridge,
        qmtBridge,
        qmtJournalFingerprintSha256: currentJournal,
      });
      if (Date.now() < deadline) {
        await delay(Math.min(intervalMs, Math.max(1, deadline - Date.now())));
      }
    } while (Date.now() < deadline);
  } finally {
    cleanupAttempted = true;
    const tdx = resolveClient('tdx', context);
    const qmt = resolveClient('qmt', context);
    await recordOperation(operations, 'tdx.syncSubscriptions.cleanup', () =>
      tdx.client.syncSubscriptions([]),
    );
    await recordOperation(operations, 'qmt.syncSubscriptions.cleanup', () =>
      qmt.client.syncSubscriptions([]),
    );
    await context.close();
  }
  return {
    profile: 'dual-source-soak',
    sessionClass: 'trading-session',
    freshnessProven: true,
    tdxSymbol,
    qmtSymbol,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs,
    intervalMs,
    maxSnapshotAgeMs,
    qmtJournalBaseline,
    samples,
    operations,
    cleanupAttempted,
  };
}

async function waitForFreshCanonicalSnapshot(
  resolved: ReturnType<typeof resolveClient>,
  source: HilSource,
  symbol: string,
  notBeforeMs: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = readCurrentSnapshot(resolved, source, symbol);
    if (snapshot && requireCapturedAtMs(snapshot.capturedAt) >= notBeforeMs) {
      return;
    }
    await delay(100);
  }
  throw new Error(`HIL ${source} soak snapshot did not become fresh`);
}

function requireCurrentSnapshot(
  resolved: ReturnType<typeof resolveClient>,
  source: HilSource,
  symbol: string,
): CanonicalRealtimeSnapshot {
  const snapshot = readCurrentSnapshot(resolved, source, symbol);
  if (!snapshot) {
    throw new Error(`HIL ${source} soak snapshot is unavailable`);
  }
  return snapshot;
}

function readCurrentSnapshot(
  resolved: ReturnType<typeof resolveClient>,
  source: HilSource,
  symbol: string,
): CanonicalRealtimeSnapshot | null {
  const securityId = resolved.resolveSecurityId(symbol);
  if (securityId === null) return null;
  const snapshot = resolved.readLatest(securityId);
  return snapshot?.source === source && snapshot.providerSymbol === symbol
    ? snapshot
    : null;
}

function requireCapturedAtMs(capturedAt: string): number {
  const value = Date.parse(capturedAt);
  if (!Number.isFinite(value)) {
    throw new Error('HIL capturedAt is not RFC3339');
  }
  return value;
}

async function readBridgeHealth(
  url: string,
  source: HilSource,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`HIL ${source} bridge health returned ${response.status}`);
  }
  return extractBridgeHealth((await response.json()) as unknown, source);
}

export function extractBridgeHealth(
  value: unknown,
  source: HilSource,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`HIL ${source} bridge health is not an object`);
  }
  const root = value as Record<string, unknown>;
  const candidate = 'bridge' in root ? root.bridge : root;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(`HIL ${source} datasource bridge health is not an object`);
  }
  const health = candidate as Record<string, unknown>;
  if (health.ready !== true || typeof health.ownerId !== 'string') {
    throw new Error(`HIL ${source} bridge is not ready`);
  }
  return { ready: true, ...sanitizeBridgeHealth(health) };
}

function sanitizeBridgeHealth(
  health: Record<string, unknown>,
): Record<string, unknown> {
  const allowedKeys = [
    'ready',
    'ownerId',
    'ownerStale',
    'ownerAgeSeconds',
    'bridgeBuildId',
    'desiredRevision',
    'convergedRevision',
    'desiredSymbols',
    'convergedSymbols',
    'lastFailureCode',
  ];
  return Object.fromEntries(
    allowedKeys.filter((key) => key in health).map((key) => [key, health[key]]),
  );
}

function fingerprintQmtJournal(directory?: string): string | null {
  if (!directory) return null;
  const files = readdirSync(directory)
    .filter(
      (name) =>
        name === 'subscription-journal.jsonl' ||
        name.includes('manifest') ||
        name.includes('compaction-checkpoint') ||
        name.includes('sealed-range-checkpoint'),
    )
    .sort();
  const digest = createHash('sha256');
  for (const name of files) {
    const path = join(directory, name);
    if (!statSync(path).isFile()) continue;
    digest.update(name);
    digest.update('\0');
    digest.update(readFileSync(path));
    digest.update('\0');
  }
  return digest.digest('hex');
}

export async function runRealtimeSubscriptionHilFromEnvironment(): Promise<void> {
  if (process.env.MIST_HIL_PROFILE === 'dual-source-soak') {
    const durationMs = positiveIntegerEnvironment(
      'MIST_HIL_SOAK_DURATION_MS',
      35 * 60 * 1000,
    );
    const intervalMs = positiveIntegerEnvironment(
      'MIST_HIL_SOAK_INTERVAL_MS',
      60_000,
    );
    const maxSnapshotAgeMs = positiveIntegerEnvironment(
      'MIST_HIL_SOAK_MAX_SNAPSHOT_AGE_MS',
      180_000,
    );
    const evidence = await runRealtimeDualSourceSoakHil({
      tdxSymbol: requireEnvironment('MIST_HIL_TDX_SYMBOL'),
      qmtSymbol: requireEnvironment('MIST_HIL_QMT_SYMBOL'),
      durationMs,
      intervalMs,
      maxSnapshotAgeMs,
      qmtStateDirectory: process.env.MIST_HIL_QMT_STATE_DIRECTORY,
      tdxBridgeHealthUrl:
        process.env.MIST_HIL_TDX_BRIDGE_HEALTH_URL ??
        'http://tdx-datasource:9001/health',
      qmtBridgeHealthUrl:
        process.env.MIST_HIL_QMT_BRIDGE_HEALTH_URL ??
        'http://qmt-datasource:9002/health',
    });
    writeHilEvidence(evidence);
    const operations = evidence.operations as HilOperationEvidence[];
    if (operations.some((operation) => operation.result === 'failure')) {
      process.exitCode = 1;
    }
    return;
  }
  const source = process.env.MIST_HIL_SOURCE;
  const symbol = process.env.MIST_HIL_SYMBOL;
  const overlaySymbol = process.env.MIST_HIL_OVERLAY_SYMBOL;
  const rawFixturePath = process.env.MIST_HIL_RAW_FIXTURE_PATH;
  const mode = process.env.MIST_HIL_MODE ?? 'verify';
  const rawCaptureDirectory = process.env.MIST_HIL_RAW_CAPTURE_DIRECTORY;
  if (
    (source !== 'tdx' && source !== 'qmt') ||
    !symbol ||
    !overlaySymbol ||
    (mode !== 'capture' && mode !== 'verify') ||
    (mode === 'verify' && !rawFixturePath) ||
    !rawCaptureDirectory
  ) {
    throw new Error(
      'MIST_HIL_SOURCE, MIST_HIL_SYMBOL, MIST_HIL_OVERLAY_SYMBOL, MIST_HIL_MODE and MIST_HIL_RAW_CAPTURE_DIRECTORY are required; verify mode also requires MIST_HIL_RAW_FIXTURE_PATH',
    );
  }
  const snapshotTimeoutMs = Number(
    process.env.MIST_HIL_SNAPSHOT_TIMEOUT_MS ?? '30000',
  );
  if (!Number.isSafeInteger(snapshotTimeoutMs) || snapshotTimeoutMs <= 0) {
    throw new Error('MIST_HIL_SNAPSHOT_TIMEOUT_MS must be a positive integer');
  }
  const qmtCallbackObservationMs = Number(
    process.env.MIST_HIL_QMT_CALLBACK_OBSERVATION_MS ?? '10000',
  );
  if (
    !Number.isSafeInteger(qmtCallbackObservationMs) ||
    qmtCallbackObservationMs <= 0
  ) {
    throw new Error(
      'MIST_HIL_QMT_CALLBACK_OBSERVATION_MS must be a positive integer',
    );
  }
  const evidence = await runRealtimeSubscriptionHil({
    source,
    symbol,
    overlaySymbol,
    rawFixturePath: mode === 'verify' ? rawFixturePath : undefined,
    rawCaptureDirectory,
    snapshotTimeoutMs,
    qmtCallbackObservationMs,
  });
  writeHilEvidence(evidence);
  if (evidence.operations.some((operation) => operation.result === 'failure')) {
    process.exitCode = 1;
  }
}

function writeHilEvidence(evidence: unknown): void {
  const serialized = JSON.stringify(evidence, null, 2) + '\n';
  const evidencePath = process.env.MIST_HIL_EVIDENCE_PATH;
  if (evidencePath) {
    writeFileSync(evidencePath, serialized, { encoding: 'utf8', mode: 0o600 });
  }
  process.stdout.write(serialized);
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function positiveIntegerEnvironment(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}
