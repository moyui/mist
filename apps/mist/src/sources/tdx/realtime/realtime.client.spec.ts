import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { TdxRealtimeClient } from './realtime.client';
import { TdxRealtimeStore } from './realtime.store';
import { TdxRealtimeAllowlistResolver } from './realtime-allowlist.resolver';

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
    provider: 'tdx',
    data: {
      mode: 'builtin',
      schemaVersion: 2,
      source: 'TDX',
      quality: 'latest-state',
    },
  };
}

function buildFrame(native: Record<string, unknown>) {
  return {
    type: 'realtime.native_snapshot',
    provider: 'tdx',
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
  } as unknown as TdxRealtimeStore;
  const allowlist = {
    resolve: jest.fn(() => ({ securityId: 600030, formatCode: '600030.SH' })),
    resolveEffective: jest.fn(() => ({
      securityId: 600030,
      formatCode: '600030.SH',
    })),
    entriesList: [],
  } as unknown as TdxRealtimeAllowlistResolver;
  const client = new TdxRealtimeClient(config, store, allowlist);
  return { client, store };
}

function message(buf: unknown): Buffer {
  return Buffer.from(JSON.stringify(buf));
}

describe('TdxRealtimeClient WS lifecycle logging', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockInstances.length = 0;
    jest.useFakeTimers();
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
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

    const logs = logSpy.mock.calls.map((c) => String(c[0]));
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
      'TDX_REALTIME_WS_ERROR',
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
    const logs = logSpy.mock.calls.map((c) => String(c[0]));
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
    const logs = logSpy.mock.calls.map((c) => String(c[0]));
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
        provider: 'tdx',
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
          s.includes('reason=TDX_REALTIME_READY_CONTRACT_MISMATCH'),
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
          '600030.SH': {
            Now: '31.25',
            Open: 30,
            Max: 32,
            Min: 29,
            LastClose: 30.5,
            Volume: '10',
            Amount: '100',
            AsOf: '2026-07-22T10:00:00',
          },
        }),
      ),
    );

    const logs = logSpy.mock.calls.map((c) => String(c[0]));
    const ingest = logs.find((s) => s.includes('candle ingest start'));
    expect(ingest).toBeDefined();
    expect(ingest).toContain('nativeKeys=');
    expect(ingest).toContain('asOf=2026-07-22T10:00:00');
    expect(ingest).toContain('volume=10');
    expect(ingest).toContain('amount=100');
  });
});
