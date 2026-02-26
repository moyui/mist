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
  // LLM Configuration
  REASONING_API_KEY: Joi.string().required(),
  REASONING_BASE_URL: Joi.string().uri().required(),
  FAST_API_KEY: Joi.string().required(),
  DEBUG: Joi.boolean().default(false),
  APP_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  TAVILY_API_KEY: Joi.string().required(),
});
