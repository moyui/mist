import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { QmtRealtimeClient } from './realtime.client';
import { QmtRealtimeStore } from './realtime.store';
import { QmtRealtimeAllowlistResolver } from './realtime-allowlist.resolver';

/**
 * In-process WebSocket mock. The client instantiates `new WebSocket(url)`, so
 * the mock captures every instance for the test to emit lifecycle events.
 */
const mockInstances: unknown[] = [];
jest.mock('ws', () => {
  class MockWebSocket {
    static readonly OPEN = 1;
    readyState = 1;
    private readonly handlers: Record<
      string,
      Array<(...args: unknown[]) => void>
    > = {};
    constructor() {
      mockInstances.push(this);
    }
    on(event: string, cb: (...args: unknown[]) => void): void {
      (this.handlers[event] ??= []).push(cb);
    }
    emit(event: string, ...args: unknown[]): void {
      this.handlers[event]?.forEach((h) => h(...args));
    }
    send(): void {
      /* noop */
    }
    close(): void {
      /* noop */
    }
  }
  return { __esModule: true, default: MockWebSocket };
});

const TS = '2026-07-22T10:00:00+08:00';

function buildReady() {
  return {
    type: 'realtime.ready',
    provider: 'qmt',
    data: {
      mode: 'builtin',
      schemaVersion: 2,
      source: 'QMT',
      quality: 'latest-state',
      leaderClientId: 'test-client',
      active: true,
    },
  };
}

function buildFrame(native: Record<string, unknown>) {
  return {
    type: 'realtime.native_snapshot',
    provider: 'qmt',
    timestamp: TS,
    data: { schemaVersion: 2, capturedAt: TS, native },
  };
}

function createClient() {
  const config = { get: () => undefined } as unknown as ConfigService;
  const store = {
    markConnected: jest.fn(),
    markDisconnected: jest.fn(),
    setError: jest.fn(),
    clearError: jest.fn(),
    recordAccepted: jest.fn(),
    recordReject: jest.fn(),
  } as unknown as QmtRealtimeStore;
  const allowlist = {
    resolve: jest.fn(() => ({ securityId: 1, formatCode: '300502.SZ' })),
    resolveEffective: jest.fn(() => ({
      securityId: 1,
      formatCode: '300502.SZ',
    })),
    entriesList: [],
  } as unknown as QmtRealtimeAllowlistResolver;
  const client = new QmtRealtimeClient(config, store, allowlist);
  return { client, store };
}

function message(buf: unknown): Buffer {
  return Buffer.from(JSON.stringify(buf));
}

describe('QmtRealtimeClient WS lifecycle logging', () => {
  let logSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockInstances.length = 0;
    jest.useFakeTimers();
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    debugSpy = (
      jest.spyOn as unknown as (t: unknown, m: string) => jest.SpyInstance
    )(Logger.prototype, 'debug').mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('logs connecting, connected, ready on a successful lifecycle', () => {
    const { client } = createClient();
    client.onModuleInit();
    const ws = mockInstances[0] as {
      emit: (event: string, ...args: unknown[]) => void;
    };
    ws.emit('open');
    ws.emit('message', message(buildReady()));

    const logs = [...logSpy.mock.calls, ...debugSpy.mock.calls].map((c) =>
      String(c[0]),
    );
    const connecting = logs.find((s) => s.includes('event=connecting'));
    expect(connecting).toBeDefined();
    expect(connecting).toContain('wsUrl=');
    expect(logs.some((s) => s.includes('event=connected'))).toBe(true);
    expect(logs.some((s) => s.includes('event=ready'))).toBe(true);
  });

  it('logs error at error level with errorMessage and lastMessageAt', () => {
    const { client, store } = createClient();
    client.onModuleInit();
    const ws = mockInstances[0] as {
      emit: (event: string, ...args: unknown[]) => void;
    };
    ws.emit('open');
    ws.emit('message', Buffer.from('any-bytes')); // updates lastMessageAt
    ws.emit('error', new Error('boom'));

    const errors = errorSpy.mock.calls.map((c) => String(c[0]));
    const errLine = errors.find((s) => s.includes('event=error'));
    expect(errLine).toBeDefined();
    expect(errLine).toContain('errorMessage=boom');
    expect(errLine).toMatch(/lastMessageAt=20/);
    expect(store.setError).toHaveBeenCalledWith(
      'QMT_REALTIME_WS_ERROR',
      'boom',
    );
  });

  it('logs disconnected warn + reconnecting on unexpected close', () => {
    const { client } = createClient();
    client.onModuleInit();
    const ws = mockInstances[0] as {
      emit: (event: string, ...args: unknown[]) => void;
    };
    ws.emit('open');
    ws.emit('close');

    const warns = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(
      warns.some(
        (s) =>
          s.includes('event=disconnected') && s.includes('willReconnect=true'),
      ),
    ).toBe(true);
    const logs = [...logSpy.mock.calls, ...debugSpy.mock.calls].map((c) =>
      String(c[0]),
    );
    expect(logs.some((s) => s.includes('event=reconnecting'))).toBe(true);
  });

  it('logs disconnected at info level (not warn) when shutting down', () => {
    const { client } = createClient();
    client.onModuleInit();
    const ws = mockInstances[0] as {
      emit: (event: string, ...args: unknown[]) => void;
    };
    ws.emit('open');
    client.onModuleDestroy(); // sets shuttingDown = true
    ws.emit('close');

    const warns = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(warns.filter((s) => s.includes('event=disconnected'))).toHaveLength(
      0,
    );
    const logs = [...logSpy.mock.calls, ...debugSpy.mock.calls].map((c) =>
      String(c[0]),
    );
    expect(
      logs.some(
        (s) =>
          s.includes('event=disconnected') && s.includes('willReconnect=false'),
      ),
    ).toBe(true);
  });

  it('logs ready_rejected warn when the ready frame fails contract', () => {
    const { client } = createClient();
    client.onModuleInit();
    const ws = mockInstances[0] as {
      emit: (event: string, ...args: unknown[]) => void;
    };
    ws.emit('open');
    ws.emit(
      'message',
      message({
        type: 'realtime.ready',
        provider: 'qmt',
        data: {
          mode: 'builtin',
          schemaVersion: 2,
          source: 'WRONG',
          quality: 'latest-state',
        },
      }),
    );

    const warns = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(
      warns.some(
        (s) =>
          s.includes('event=ready_rejected') &&
          s.includes('reason=QMT_REALTIME_READY_CONTRACT_MISMATCH'),
      ),
    ).toBe(true);
  });

  it('carries native summary fields on the snapshot ingest log', () => {
    const { client } = createClient();
    client.onModuleInit();
    const ws = mockInstances[0] as {
      emit: (event: string, ...args: unknown[]) => void;
    };
    ws.emit('open');
    ws.emit('message', message(buildReady())); // transportReady = true
    ws.emit(
      'message',
      message(
        buildFrame({
          '300502.SZ': {
            lastPrice: 541.2,
            open: 540,
            high: 542,
            low: 539,
            volume: 10,
            amount: 100,
          },
        }),
      ),
    );

    const logs = [...logSpy.mock.calls, ...debugSpy.mock.calls].map((c) =>
      String(c[0]),
    );
    const ingest = logs.find((s) => s.includes('candle ingest start'));
    expect(ingest).toBeDefined();
    expect(ingest).toContain('nativeKeys=');
    expect(ingest).toContain('asOf=-'); // QMT native has no AsOf
    expect(ingest).toContain('volume=10');
    expect(ingest).toContain('amount=100');
  });
});
