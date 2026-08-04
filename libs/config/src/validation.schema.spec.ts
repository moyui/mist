import { backtestEnvSchema, mistEnvSchema } from './validation.schema';

const baseEnv = {
  mysql_server_host: 'localhost',
  mysql_server_username: 'mist',
  mysql_server_password: 'mist',
  mysql_server_database: 'mist',
};

describe('mistEnvSchema data source configuration', () => {
  it.each(['qmt', 'QMT'])('accepts DEFAULT_DATA_SOURCE=%s', (source) => {
    const { error, value } = mistEnvSchema.validate({
      ...baseEnv,
      DEFAULT_DATA_SOURCE: source,
    });

    expect(error).toBeUndefined();
    expect(value.DEFAULT_DATA_SOURCE).toBe(source);
  });

  it.each(['mqmt', 'MINI_QMT'])(
    'rejects legacy DEFAULT_DATA_SOURCE=%s',
    (source) => {
      const { error } = mistEnvSchema.validate({
        ...baseEnv,
        DEFAULT_DATA_SOURCE: source,
      });

      expect(error?.message).toContain('DEFAULT_DATA_SOURCE');
    },
  );

  it('validates QMT historical bars base URL and keeps realtime client id', () => {
    const { error, value } = mistEnvSchema.validate({
      ...baseEnv,
      QMT_BASE_URL: 'http://127.0.0.1:9002',
      QMT_WS_CLIENT_ID: 'mist-backend-qmt-live',
      QMT_REALTIME_MODE: 'builtin',
      QMT_REALTIME_ALLOWLIST: '600519.SH',
    });

    expect(error).toBeUndefined();
    expect(value.QMT_BASE_URL).toBe('http://127.0.0.1:9002');
    expect(value.QMT_WS_CLIENT_ID).toBe('mist-backend-qmt-live');
    expect(value.TDX_REALTIME_MODE).toBe('builtin');
    expect(value.QMT_REALTIME_MODE).toBe('builtin');
    expect(value.QMT_REALTIME_ALLOWLIST).toBe('600519.SH');
  });

  it('defaults both realtime sources to builtin and rejects unknown modes', () => {
    const defaults = mistEnvSchema.validate(baseEnv);
    expect(defaults.error).toBeUndefined();
    expect(defaults.value.TDX_REALTIME_MODE).toBe('builtin');
    expect(defaults.value.QMT_REALTIME_MODE).toBe('builtin');

    const invalidTdx = mistEnvSchema.validate({
      ...baseEnv,
      TDX_REALTIME_MODE: 'legacy',
    });
    expect(invalidTdx.error?.message).toContain('TDX_REALTIME_MODE');

    const invalidQmt = mistEnvSchema.validate({
      ...baseEnv,
      QMT_REALTIME_MODE: 'legacy',
    });
    expect(invalidQmt.error?.message).toContain('QMT_REALTIME_MODE');
  });

  it('accepts the explicit empty allowlists emitted by Docker Compose', () => {
    const { error, value } = mistEnvSchema.validate({
      ...baseEnv,
      TDX_REALTIME_MODE: 'builtin',
      TDX_REALTIME_ALLOWLIST: '',
      QMT_REALTIME_MODE: 'builtin',
      QMT_REALTIME_ALLOWLIST: '',
    });

    expect(error).toBeUndefined();
    expect(value.TDX_REALTIME_ALLOWLIST).toBe('');
    expect(value.QMT_REALTIME_ALLOWLIST).toBe('');
  });

  it('owns the realtime candle grace and queue defaults', () => {
    const { error, value } = mistEnvSchema.validate(baseEnv);

    expect(error).toBeUndefined();
    expect(value.REALTIME_CANDLE_GRACE_MS).toBe(5_000);
    expect(value.REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES).toBe(8);
    expect(value.REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL).toBe(256);
  });

  it.each([
    ['REALTIME_CANDLE_GRACE_MS', 999],
    ['REALTIME_CANDLE_GRACE_MS', 30_001],
    ['REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES', 0],
    ['REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES', 257],
    ['REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL', 15],
    ['REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL', 4_097],
  ])('rejects out-of-range %s=%s', (name, invalidValue) => {
    const { error } = mistEnvSchema.validate({
      ...baseEnv,
      [name]: invalidValue,
    });

    expect(error?.message).toContain(name);
  });

  it('rejects a global pending limit lower than the per-series limit', () => {
    const { error } = mistEnvSchema.validate({
      ...baseEnv,
      REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES: 32,
      REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL: 16,
    });

    expect(error?.message).toContain(
      'REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL must be greater than or equal to REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES',
    );
  });
});

describe('backtestEnvSchema runtime limits', () => {
  it('provides approved listener and admission defaults', () => {
    const { error, value } = backtestEnvSchema.validate(baseEnv);
    expect(error).toBeUndefined();
    expect(value.PORT).toBe(8004);
    expect(value.BACKTEST_RPC_PORT).toBe(8005);
    expect(value.BACKTEST_QUEUE_CAPACITY).toBe(8);
    expect(value.BACKTEST_CONCURRENCY).toBe(2);
    expect(value.BACKTEST_RUN_TIMEOUT_MS).toBe(1_800_000);
    expect(value.BACKTEST_MAX_BARS_PER_RUN).toBe(10_000_000);
  });

  it('rejects equal listener ports and out-of-range limits', () => {
    expect(
      backtestEnvSchema.validate({ ...baseEnv, PORT: 8005 }).error?.message,
    ).toContain('PORT and BACKTEST_RPC_PORT');
    expect(
      backtestEnvSchema.validate({ ...baseEnv, BACKTEST_QUEUE_CAPACITY: 65 })
        .error?.message,
    ).toContain('BACKTEST_QUEUE_CAPACITY');
    expect(
      backtestEnvSchema.validate({
        ...baseEnv,
        BACKTEST_RUN_TIMEOUT_MS: 59_999,
      }).error?.message,
    ).toContain('BACKTEST_RUN_TIMEOUT_MS');
  });
});
