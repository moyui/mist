import * as Joi from 'joi';

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
 * Saya app-specific environment variable validation
 */
export const sayaEnvSchema = Joi.object({
  // Reasoning LLM
  REASONING_API_KEY: Joi.string().required(),
  REASONING_BASE_URL: Joi.string().uri().required(),
  REASONING_MODEL: Joi.string().optional(),
  // Fast LLM
  FAST_API_KEY: Joi.string().required(),
  FAST_BASE_URL: Joi.string().uri().optional(),
  FAST_MODEL: Joi.string().optional(),
  // Vision LLM
  VL_API_KEY: Joi.string().optional(),
  VL_BASE_URL: Joi.string().uri().optional(),
  VL_MODEL: Joi.string().optional(),
  // Other
  DEBUG: Joi.boolean().default(false),
  APP_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  TAVILY_API_KEY: Joi.string().required(),
}).concat(commonEnvSchema);

/**
 * Mist app-specific environment variable validation
 */
export const mistEnvSchema = commonEnvSchema.append({
  PORT: Joi.number().port().default(8001),
  redis_server_host: Joi.string().hostname().default('localhost'),
  redis_server_port: Joi.number().port().default(6379),
  redis_server_db: Joi.number().default(0),

  // Data source configuration
  // Accepts enum values ('ef', 'tdx', 'mqmt') or enum keys ('EAST_MONEY', 'TDX', 'MINI_QMT')
  DEFAULT_DATA_SOURCE: Joi.string()
    .valid('ef', 'tdx', 'mqmt', 'EAST_MONEY', 'TDX', 'MINI_QMT')
    .default('ef')
    .description('Default data source for queries (enum value or key)'),

  // TDX data source configuration
  TDX_BASE_URL: Joi.string()
    .uri()
    .optional()
    .description('TDX data source base URL (mist-datasource service)'),
});

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
 * MCP Server app-specific environment variable validation
 */
export const mcpEnvSchema = commonEnvSchema.append({
  PORT: Joi.number().port().default(8009),
});
