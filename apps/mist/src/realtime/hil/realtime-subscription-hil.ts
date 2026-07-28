import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  operations: HilOperationEvidence[];
  cleanupAttempted: boolean;
}

interface CapturedRawFixtureEvidence {
  phase: 'whole' | 'overlay';
  symbol: string;
  capturedAt: string;
  fileName: string;
  sha256: string;
  canonicalReadback: CanonicalReadbackEvidence;
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
  const valid =
    source === 'qmt'
      ? isQmtState(afterSync, symbol, []) &&
        isQmtState(afterSubscribe, symbol, [overlaySymbol]) &&
        isQmtState(afterUnsubscribe, symbol, [])
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

export async function runRealtimeSubscriptionHilFromEnvironment(): Promise<void> {
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
  const evidence = await runRealtimeSubscriptionHil({
    source,
    symbol,
    overlaySymbol,
    rawFixturePath: mode === 'verify' ? rawFixturePath : undefined,
    rawCaptureDirectory,
    snapshotTimeoutMs,
  });
  const serialized = JSON.stringify(evidence, null, 2) + '\n';
  const evidencePath = process.env.MIST_HIL_EVIDENCE_PATH;
  if (evidencePath) {
    writeFileSync(evidencePath, serialized, { encoding: 'utf8', mode: 0o600 });
  }
  process.stdout.write(serialized);
  if (evidence.operations.some((operation) => operation.result === 'failure')) {
    process.exitCode = 1;
  }
}
