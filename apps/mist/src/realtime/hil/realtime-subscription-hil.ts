import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
import { RealtimeSubscriptionControl } from '../realtime-subscription-control';
import { SubscriptionControlResult } from '../realtime-subscription-control';

type HilSource = 'tdx' | 'qmt';

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
  rawFixtureSymbol: string;
  rawFixtureSha256: string;
  formalFixtureSha256: string;
  operations: HilOperationEvidence[];
  cleanupAttempted: boolean;
}

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

export async function runRealtimeSubscriptionHil(
  source: HilSource,
  symbol: string,
  rawFixturePath: string,
): Promise<HilEvidence> {
  const rawFixtureSymbol = requireMatchingRawFixtureSymbol(
    rawFixturePath,
    symbol,
  );
  const context = await NestFactory.createApplicationContext(
    createHilModule(source),
    { logger: ['error', 'warn'] },
  );
  const operations: HilEvidence['operations'] = [];
  let cleanupAttempted = false;
  try {
    const { client, ready } = resolveClient(source, context);
    await waitUntilReady(ready, 30_000);
    operations.push(...(await runControlSequence(client, symbol)));
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
    rawFixtureSymbol,
    rawFixtureSha256: sha256(rawFixturePath),
    formalFixtureSha256: sha256(formalFixturePath),
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
} {
  if (source === 'qmt') {
    return {
      client: context.get(QmtRealtimeClient, { strict: false }),
      ready: () =>
        context.get(QmtRealtimeStore, { strict: false }).status().ready,
    };
  }
  return {
    client: context.get(TdxRealtimeClient, { strict: false }),
    ready: () =>
      context.get(TdxRealtimeStore, { strict: false }).status().ready,
  };
}

export async function runControlSequence(
  client: RealtimeSubscriptionControl,
  symbol: string,
): Promise<HilOperationEvidence[]> {
  const operations: HilOperationEvidence[] = [];
  await recordOperation(operations, 'getSubscriptions.before', () =>
    client.getSubscriptions(),
  );
  await recordOperation(operations, 'syncSubscriptions.target', () =>
    client.syncSubscriptions([symbol]),
  );
  await recordOperation(operations, 'getSubscriptions.afterSync', () =>
    client.getSubscriptions(),
  );
  await recordOperation(operations, 'subscribe.overlay', () =>
    client.subscribe(symbol),
  );
  await recordOperation(operations, 'getSubscriptions.afterSubscribe', () =>
    client.getSubscriptions(),
  );
  await recordOperation(operations, 'unsubscribe.overlay', () =>
    client.unsubscribe(symbol),
  );
  await recordOperation(operations, 'getSubscriptions.afterUnsubscribe', () =>
    client.getSubscriptions(),
  );
  return operations;
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
): Promise<void> {
  try {
    operations.push(summarize(operation, await invoke()));
  } catch {
    operations.push({
      operation,
      result: 'failure',
      reason: 'HIL_OPERATION_THROWN',
    });
  }
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
  const rawFixturePath = process.env.MIST_HIL_RAW_FIXTURE_PATH;
  if ((source !== 'tdx' && source !== 'qmt') || !symbol || !rawFixturePath) {
    throw new Error(
      'MIST_HIL_SOURCE, MIST_HIL_SYMBOL and MIST_HIL_RAW_FIXTURE_PATH are required',
    );
  }
  const evidence = await runRealtimeSubscriptionHil(
    source,
    symbol,
    rawFixturePath,
  );
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
