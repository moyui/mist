import * as Joi from 'joi';
import {
  REALTIME_CANDLE_GRACE_LIMITS,
  REALTIME_CANDLE_QUEUE_LIMITS,
} from './realtime-candle.config';

/**
 * Common environment variable validation schema
 * Shared across all apps that need database connection
 */
export const commonEnvSchema = Joi.object({
  // MySQL Configuration
  mysql_server_host: Joi.string().hostname().required(),
  mysql_server_port: Joi.number().port().default(3306),
  mysql_server_username: Joi.string().required(),
  mysql_server_password: Joi.string().required(),
  mysql_server_database: Joi.string().required(),

  // Environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  // AKTools
  AKTOOLS_BASE_URL: Joi.string().uri().default('http://localhost:8080'),
});

/**
 * App-specific environment variable validation
 */
export const appEnvSchema = Joi.object({
  // Add app-specific variables (ports, API keys, etc.)
  nest_server_port: Joi.number().port().default(3000),
  redis_server_host: Joi.string().hostname().default('localhost'),
  redis_server_port: Joi.number().port().default(6379),
  redis_server_db: Joi.number().default(0),
}).concat(commonEnvSchema);

/**
 * Mist app-specific environment variable validation
 */
export const mistEnvSchema = commonEnvSchema
  .append({
    PORT: Joi.number().port().default(8001),
    redis_server_host: Joi.string().hostname().default('localhost'),
    redis_server_port: Joi.number().port().default(6379),
    redis_server_db: Joi.number().default(0),

    // Data source configuration
    // Accepts enum values ('ef', 'tdx', 'qmt') or enum keys ('EAST_MONEY', 'TDX', 'QMT')
    DEFAULT_DATA_SOURCE: Joi.string()
      .valid('ef', 'tdx', 'qmt', 'EAST_MONEY', 'TDX', 'QMT')
      .default('ef')
      .description('Default data source for queries (enum value or key)'),

    // TDX data source configuration
    TDX_BASE_URL: Joi.string()
      .uri()
      .optional()
      .description('TDX data source base URL (mist-datasource service)'),

    // WebSocket client identification for multi-connection support
    // Each data source has its own WebSocket endpoint and client ID
    TDX_WS_CLIENT_ID: Joi.string()
      .default('mist-backend-tdx')
      .description('WebSocket client ID for TDX data source connection'),

    TDX_WS_RECONNECT_DELAY_MS: Joi.number()
      .integer()
      .positive()
      .default(5000)
      .description('TDX WebSocket reconnect delay in milliseconds'),

    TDX_WS_HEARTBEAT_INTERVAL_MS: Joi.number()
      .integer()
      .positive()
      .default(30000)
      .description('TDX WebSocket heartbeat interval in milliseconds'),

    TDX_REALTIME_MODE: Joi.string()
      .valid('off', 'builtin')
      .default('builtin')
      .description('TDX realtime mode: builtin (default) or off for rollback'),

    TDX_REALTIME_ALLOWLIST: Joi.string()
      .allow('')
      .default('')
      .description(
        'Comma-separated exact formatCodes for TDX realtime (max 5)',
      ),

    // QMT historical bars datasource configuration
    QMT_BASE_URL: Joi.string()
      .uri()
      .optional()
      .description('QMT data source base URL (mist-qmt-datasource service)'),

    // QMT realtime streaming uses the same production mode contract as TDX.
    QMT_WS_CLIENT_ID: Joi.string()
      .default('mist-backend-qmt')
      .description(
        'WebSocket client ID for QMT realtime data source connection',
      ),

    QMT_WS_RECONNECT_DELAY_MS: Joi.number()
      .integer()
      .positive()
      .default(5000)
      .description('QMT WebSocket reconnect delay in milliseconds'),

    QMT_REALTIME_MODE: Joi.string()
      .valid('off', 'builtin')
      .default('builtin')
      .description('QMT realtime mode: builtin (default) or off for rollback'),

    QMT_REALTIME_ALLOWLIST: Joi.string()
      .allow('')
      .default('')
      .description(
        'Comma-separated exact QMT formatCodes for realtime (max 5)',
      ),

    // ===== B1: current-day realtime market data productization =====
    // Single-node V1 may share this persistent Redis endpoint with realtime
    // BullMQ. Market state and queue state still require separate prefixes,
    // client owners and capacity observations.
    MIST_REALTIME_REDIS_URL: Joi.string()
      .uri()
      .allow('')
      .default('')
      .description(
        'Persistent Redis URL for current-day realtime candles; empty = disabled (memory-only)',
      ),

    REALTIME_PRODUCTIZATION_MODE: Joi.string()
      .valid('off', 'shadow', 'on')
      .default('off')
      .description(
        'off=memory-only (default); shadow=aggregate+write Redis but hide from query; on=expose Redis-backed current-day query',
      ),

    REALTIME_STRATEGY_MODE: Joi.string()
      .valid('off', 'shadow', 'on')
      .default('off')
      .description(
        'off=registry only; shadow=evaluate without strategy persistence; on=enable live signal persistence',
      ),

    REALTIME_STRATEGY_JOB_TIMEOUT_MS: Joi.number()
      .integer()
      .positive()
      .default(30_000)
      .description('Overall candle_finalized worker deadline in milliseconds'),

    SIGNAL_RPC_HOST: Joi.string().hostname().default('signal'),
    SIGNAL_RPC_PORT: Joi.number().port().default(9010),

    REALTIME_CANDLE_GRACE_MS: Joi.number()
      .integer()
      .min(REALTIME_CANDLE_GRACE_LIMITS.min)
      .max(REALTIME_CANDLE_GRACE_LIMITS.max)
      .default(REALTIME_CANDLE_GRACE_LIMITS.default),

    REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES: Joi.number()
      .integer()
      .min(REALTIME_CANDLE_QUEUE_LIMITS.perSeries.min)
      .max(REALTIME_CANDLE_QUEUE_LIMITS.perSeries.max)
      .default(REALTIME_CANDLE_QUEUE_LIMITS.perSeries.default),

    REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL: Joi.number()
      .integer()
      .min(REALTIME_CANDLE_QUEUE_LIMITS.global.min)
      .max(REALTIME_CANDLE_QUEUE_LIMITS.global.max)
      .default(REALTIME_CANDLE_QUEUE_LIMITS.global.default),
  })
  .custom((value: Record<string, unknown>, helpers) => {
    const perSeries = value[
      'REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES'
    ] as number;
    const global = value['REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL'] as number;
    if (global < perSeries) {
      return helpers.message({
        custom:
          'REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL must be greater than or equal to REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES',
      });
    }
    return value;
  }, 'realtime candle queue limit relationship');

/**
 * Chan app-specific environment variable validation
 */
export const chanEnvSchema = commonEnvSchema.append({
  PORT: Joi.number().port().default(8008),

  // TDX data source configuration
  TDX_BASE_URL: Joi.string()
    .uri()
    .optional()
    .description('TDX data source base URL (mist-datasource service)'),
});

/**
 * Schedule app-specific environment variable validation
 */
export const scheduleEnvSchema = commonEnvSchema.append({
  PORT: Joi.number().port().default(8003),
});

/**
 * Signal app-specific environment variable validation.
 * Realtime Redis is required only when shadow/on modules are assembled.
 */
export const signalEnvSchema = commonEnvSchema.append({
  PORT: Joi.number().port().default(8010),
  SIGNAL_RPC_PORT: Joi.number().port().default(9010),
  REALTIME_STRATEGY_MODE: Joi.string()
    .valid('off', 'shadow', 'on')
    .default('off'),
  MIST_REALTIME_REDIS_URL: Joi.string().uri().allow('').default(''),
  REALTIME_STRATEGY_JOB_TIMEOUT_MS: Joi.number()
    .integer()
    .positive()
    .default(30_000),
});

export type RealtimeStrategyMode = 'off' | 'shadow' | 'on';

export function resolveRealtimeStrategyMode(
  value: string | undefined,
): RealtimeStrategyMode {
  const normalized = (value ?? 'off').trim().toLowerCase();
  if (normalized === 'off' || normalized === 'shadow' || normalized === 'on') {
    return normalized;
  }
  throw new Error(
    `Unsupported REALTIME_STRATEGY_MODE=${JSON.stringify(value)}; expected off, shadow or on`,
  );
}
