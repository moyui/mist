import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../../app.module';
import { QmtRealtimeClient } from '../../sources/qmt/realtime/realtime.client';
import { QmtRealtimeStore } from '../../sources/qmt/realtime/realtime.store';
import { TdxRealtimeClient } from '../../sources/tdx/realtime/realtime.client';
import { TdxRealtimeStore } from '../../sources/tdx/realtime/realtime.store';
import { SubscriptionControlResult } from '../realtime-subscription-control';

type HilSource = 'tdx' | 'qmt';

interface HilEvidence {
  source: HilSource;
  symbol: string;
  rawFixtureSha256: string;
  formalFixtureSha256: string;
  operations: Array<{
    operation: string;
    result: 'success' | 'failure';
    reason: string;
  }>;
  cleanupAttempted: boolean;
}

export async function runRealtimeSubscriptionHil(
  source: HilSource,
  symbol: string,
  rawFixturePath: string,
): Promise<HilEvidence> {
  const context = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const operations: HilEvidence['operations'] = [];
  let cleanupAttempted = false;
  try {
    const { client, ready } =
      source === 'qmt'
        ? {
            client: context.get(QmtRealtimeClient, { strict: false }),
            ready: () =>
              context.get(QmtRealtimeStore, { strict: false }).status().ready,
          }
        : {
            client: context.get(TdxRealtimeClient, { strict: false }),
            ready: () =>
              context.get(TdxRealtimeStore, { strict: false }).status().ready,
          };
    await waitUntilReady(ready, 30_000);

    operations.push(
      summarize('getSubscriptions.before', await client.getSubscriptions()),
    );
    const subscribeResult = await client.subscribe(symbol);
    operations.push(summarize('subscribe', subscribeResult));
    operations.push(
      summarize(
        'getSubscriptions.afterSubscribe',
        await client.getSubscriptions(),
      ),
    );

    cleanupAttempted = true;
    operations.push(
      summarize('unsubscribe.cleanup', await client.unsubscribe(symbol)),
    );
    operations.push(
      summarize(
        'getSubscriptions.afterCleanup',
        await client.getSubscriptions(),
      ),
    );

    const formalFixturePath = resolve(
      __dirname,
      '../../../../../test/fixtures/realtime/realtime-native-frame-v2.json',
    );
    return {
      source,
      symbol,
      rawFixtureSha256: sha256(rawFixturePath),
      formalFixtureSha256: sha256(formalFixturePath),
      operations,
      cleanupAttempted,
    };
  } finally {
    await context.close();
  }
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

function summarize(
  operation: string,
  result: SubscriptionControlResult,
): HilEvidence['operations'][number] {
  if ('success' in result) {
    return { operation, result: 'success', reason: 'none' };
  }
  return {
    operation,
    result: 'failure',
    reason: result.failure.reason,
  };
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function main(): Promise<void> {
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
  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      (error instanceof Error ? error.message : String(error)) + '\n',
    );
    process.exitCode = 1;
  });
}
