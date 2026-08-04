import { CandleFinalizer } from './candle-finalizer';
import type { SealedCandle } from './candle.types';

/**
 * Fake ioredis multi/exec chain. Records every command in order so the test
 * can assert the exact MULTI/EXEC sequence.
 */
interface RecordedCommand {
  cmd: string;
  args: unknown[];
}

interface FakeChain {
  hset: jest.Mock;
  hdel: jest.Mock;
  zrem: jest.Mock;
  expireat: jest.Mock;
  exec: jest.Mock;
}

function makeFakeRedis(): {
  multi: jest.Mock;
  chain: FakeChain;
  commands: RecordedCommand[];
} {
  const commands: RecordedCommand[] = [];
  const chain: FakeChain = {
    hset: jest.fn((...args: unknown[]) => {
      commands.push({ cmd: 'hset', args });
      return chain;
    }),
    hdel: jest.fn((...args: unknown[]) => {
      commands.push({ cmd: 'hdel', args });
      return chain;
    }),
    zrem: jest.fn((...args: unknown[]) => {
      commands.push({ cmd: 'zrem', args });
      return chain;
    }),
    expireat: jest.fn((...args: unknown[]) => {
      commands.push({ cmd: 'expireat', args });
      return chain;
    }),
    exec: jest.fn(async () => []),
  };
  const multi = jest.fn(() => chain);
  return { multi, chain, commands };
}

function makeSealed(overrides: Partial<SealedCandle> = {}): SealedCandle {
  return {
    tradingDay: '20260728',
    source: 'tdx',
    providerSymbol: '600030.SH',
    securityId: 1,
    session: 'morning',
    bucketStartMs: Date.parse('2026-07-28T01:30:00.000Z'),
    bucketEndMs: Date.parse('2026-07-28T01:31:00.000Z'),
    open: 10,
    high: 12,
    low: 9,
    close: 11,
    volume: '100',
    amount: '1100',
    closingCumulativeVolume: '5000',
    closingCumulativeAmount: '55000',
    closingSnapshot: null,
    firstEventTime: '2026-07-28T01:30:00+08:00',
    lastEventTime: '2026-07-28T01:30:45+08:00',
    validity: 'valid',
    invalidReason: null,
    quality: 'provisional',
    ...overrides,
  };
}

describe('CandleFinalizer', () => {
  it('commits a valid candle: HSET closed + watermark + ZREM due + manifest + EXPIRE', async () => {
    const fake = makeFakeRedis();
    // Wire multi().exec() to resolve.
    fake.chain.exec.mockResolvedValue([]);
    // multi() returns chain; chain has exec.
    fake.multi.mockReturnValue(fake.chain);

    const finalizer = new CandleFinalizer();
    const candle = makeSealed();
    const nowMs = candle.bucketEndMs; // TTL computed from bucket end

    const ok = await finalizer.seal(fake as any, candle, nowMs);

    expect(ok).toBe(true);
    expect(fake.multi).toHaveBeenCalledTimes(1);

    const cmds = fake.commands.map((c) => c.cmd);
    // Valid candle writes closed record.
    expect(cmds).toContain('hset');
    // The first hset should target the closed-candle key.
    const closedHset = fake.commands.find(
      (c) =>
        c.cmd === 'hset' && String(c.args[0]).includes(':candle:1m:closed'),
    );
    expect(closedHset).toBeDefined();
    expect(closedHset!.args[1]).toBe(String(candle.bucketStartMs));
    // The compact record value is valid JSON with OHLC.
    const record = JSON.parse(closedHset!.args[2] as string);
    expect(record).toMatchObject({
      o: 10,
      h: 12,
      l: 9,
      c: 11,
      v: '100',
      q: 'provisional',
    });

    // Watermark hset records outcome=closed.
    const wmHset = fake.commands.find(
      (c) =>
        c.cmd === 'hset' && String(c.args[0]).includes(':candle:1m:watermark'),
    );
    expect(wmHset).toBeDefined();
    expect(wmHset!.args[1]).toMatchObject({ outcome: 'closed' });

    // Due member removed.
    const zrem = fake.commands.find((c) => c.cmd === 'zrem');
    expect(zrem).toBeDefined();
    expect(zrem!.args[0]).toContain(':candle:1m:due');
    expect(zrem!.args[1]).toBe(`1:tdx:${candle.bucketStartMs}`);

    // Manifest recorded.
    const manifest = fake.commands.find(
      (c) => c.cmd === 'hset' && String(c.args[0]).includes(':manifest'),
    );
    expect(manifest).toBeDefined();

    // EXPIREAT on closed, watermark, manifest and the exact market due key.
    const expires = fake.commands.filter((c) => c.cmd === 'expireat');
    expect(expires).toHaveLength(4);
    expect(new Set(expires.map((command) => command.args[1]))).toEqual(
      new Set([Date.parse('2026-07-29T00:00:00+08:00') / 1_000]),
    );
  });

  it('preserves null quantities without serializing the string null', async () => {
    const fake = makeFakeRedis();
    fake.chain.exec.mockResolvedValue([]);
    fake.multi.mockReturnValue(fake.chain);
    const candle = makeSealed({
      volume: null,
      amount: null,
      closingCumulativeVolume: null,
      closingCumulativeAmount: null,
    });

    expect(
      await new CandleFinalizer().seal(fake as any, candle, candle.bucketEndMs),
    ).toBe(true);
    const closedHset = fake.commands.find(
      (command) =>
        command.cmd === 'hset' &&
        String(command.args[0]).includes(':candle:1m:closed'),
    );
    const record = JSON.parse(closedHset!.args[2] as string);
    expect(record).toMatchObject({ v: null, a: null, cv: null, ca: null });
    const deletedFields = fake.commands
      .filter((command) => command.cmd === 'hdel')
      .map((command) => command.args[1]);
    expect(deletedFields).toEqual([
      'closingCumulativeVolume',
      'closingCumulativeAmount',
    ]);
  });

  it('does NOT write closed record for an invalid candle (discarded)', async () => {
    const fake = makeFakeRedis();
    fake.chain.exec.mockResolvedValue([]);
    fake.multi.mockReturnValue(fake.chain);

    const finalizer = new CandleFinalizer();
    const candle = makeSealed({
      validity: 'invalid',
      invalidReason: 'counter_reset',
    });

    const ok = await finalizer.seal(fake as any, candle, candle.bucketEndMs);

    expect(ok).toBe(true);
    // No hset targeting the closed key.
    const closedHset = fake.commands.find(
      (c) =>
        c.cmd === 'hset' && String(c.args[0]).includes(':candle:1m:closed'),
    );
    expect(closedHset).toBeUndefined();

    // Watermark still advanced with outcome=discarded + reason.
    const wmHset = fake.commands.find(
      (c) =>
        c.cmd === 'hset' && String(c.args[0]).includes(':candle:1m:watermark'),
    );
    expect(wmHset!.args[1]).toMatchObject({
      outcome: 'discarded',
      invalidReason: 'counter_reset',
    });

    // Due member still removed.
    expect(fake.commands.find((c) => c.cmd === 'zrem')).toBeDefined();
  });

  it('returns false and logs when exec throws', async () => {
    const fake = makeFakeRedis();
    fake.chain.exec.mockRejectedValue(new Error('ECONNRESET'));
    fake.multi.mockReturnValue(fake.chain);

    const finalizer = new CandleFinalizer();
    const candle = makeSealed();
    const ok = await finalizer.seal(fake as any, candle, candle.bucketEndMs);

    expect(ok).toBe(false);
  });

  it('returns false when exec returns null (transaction discarded)', async () => {
    const fake = makeFakeRedis();
    fake.chain.exec.mockResolvedValue(null);
    fake.multi.mockReturnValue(fake.chain);

    const finalizer = new CandleFinalizer();
    const candle = makeSealed();
    const ok = await finalizer.seal(fake as any, candle, candle.bucketEndMs);

    expect(ok).toBe(false);
  });

  it('rejects a write after the Shanghai D+1 midnight expiry', async () => {
    const fake = makeFakeRedis();
    fake.chain.exec.mockResolvedValue([]);
    fake.multi.mockReturnValue(fake.chain);

    const finalizer = new CandleFinalizer();
    const candle = makeSealed();
    await expect(
      finalizer.seal(
        fake as any,
        candle,
        Date.parse('2026-07-29T00:00:00+08:00'),
      ),
    ).resolves.toBe(false);
    expect(fake.multi).not.toHaveBeenCalled();
  });

  it('rejects an oversized sealed record before opening a Redis transaction', async () => {
    const fake = makeFakeRedis();
    const candle = makeSealed({
      closingSnapshot: {
        securityId: 1,
        providerSymbol: '600030.SH',
        source: 'tdx',
        eventTime: '2026-07-28T09:30:59+08:00',
        capturedAt: 'x'.repeat(3_000),
        price: 11,
        cumulativeVolume: '5000',
        cumulativeAmount: '55000',
        quality: {
          level: 'latest-state',
          eventTimeAvailable: true,
          aggregationEligible: true,
          partialPrices: false,
        },
      },
    });

    await expect(
      new CandleFinalizer().seal(fake as any, candle, candle.bucketEndMs),
    ).resolves.toBe(false);
    expect(fake.multi).not.toHaveBeenCalled();
  });

  it('commits a no-snapshot discard with manifest and no closed record', async () => {
    const fake = makeFakeRedis();
    fake.chain.exec.mockResolvedValue([]);
    fake.multi.mockReturnValue(fake.chain);
    const bucketStartMs = Date.parse('2026-07-28T01:30:00.000Z');

    const finalizer = new CandleFinalizer();
    await expect(
      finalizer.discardDue(
        fake as any,
        {
          securityId: 1,
          source: 'tdx',
          bucketStartMs,
        },
        'no_snapshot',
        bucketStartMs + 65_000,
      ),
    ).resolves.toBe(true);

    expect(
      fake.commands.find(
        (command) =>
          command.cmd === 'hset' &&
          String(command.args[0]).includes(':candle:1m:closed'),
      ),
    ).toBeUndefined();
    expect(
      fake.commands.find(
        (command) =>
          command.cmd === 'hset' &&
          String(command.args[0]).includes(':candle:1m:watermark'),
      )?.args[1],
    ).toMatchObject({
      outcome: 'discarded',
      invalidReason: 'no_snapshot',
    });
    expect(
      fake.commands.find(
        (command) =>
          command.cmd === 'hset' &&
          String(command.args[0]).includes(':manifest'),
      ),
    ).toBeDefined();
    expect(finalizer.diagnostics()).toMatchObject({
      discardTotals: [{ reason: 'no_snapshot', total: 1 }],
      finalizationFailureTotal: 0,
      recordLimitBreachTotal: 0,
    });
    expect(finalizer.diagnostics().maxManifestBytes).toBeGreaterThan(0);
  });
});
