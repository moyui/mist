# Config & Port Configuration Standardization Design

**Date:** 2026-03-15
**Status:** Approved

## Overview

Standardize environment variable naming and validation across all backend applications. Unify port configuration naming and add Joi validation for runtime configuration.

## Problem Statement

### Current Issues

1. **Inconsistent port variable naming:**
   - mist: `PORT`
   - saya: `port` (lowercase)
   - schedule: `port` (lowercase)
   - chan: `PORT`
   - mcp-server: `MCP_SERVER_PORT`

2. **Missing port configuration:**
   - Only mcp-server has PORT in `.env.example`
   - Other apps use hardcoded defaults in `main.ts`

3. **Incorrect configuration:**
   - mist `.env.example` has `nest_server_port=3000` but actual default is 8001

4. **No Joi validation:**
   - Environment variables not validated at startup
   - Configuration errors only discovered at runtime

## Design

### 1. Unified Environment Variable Naming

All applications use `PORT` for server port configuration:

| Application | Variable Name | Default Value | Old Variable Name |
|-------------|--------------|---------------|-------------------|
| mist | `PORT` | 8001 | `PORT` (unchanged) |
| saya | `PORT` | 8002 | `port` → `PORT` |
| schedule | `PORT` | 8003 | `port` → `PORT` |
| chan | `PORT` | 8008 | `PORT` (unchanged) |
| mcp-server | `PORT` | 8009 | `MCP_SERVER_PORT` → `PORT` |

**Rationale:** Each app has its own `.env` file, so no conflict occurs. Simple and consistent.

### 2. Joi Schema Structure

Add application-specific schemas to `libs/config/src/validation.schema.ts`:

```typescript
// Existing common schema (unchanged)
export const commonEnvSchema = Joi.object({
  mysql_server_host: Joi.string().hostname().required(),
  mysql_server_port: Joi.number().port().default(3306),
  mysql_server_username: Joi.string().required(),
  mysql_server_password: Joi.string().required(),
  mysql_server_database: Joi.string().required(),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
});

// New: mist schema
export const mistEnvSchema = commonEnvSchema.append({
  PORT: Joi.number().port().default(8001),
  redis_server_host: Joi.string().hostname().default('localhost'),
  redis_server_port: Joi.number().port().default(6379),
  redis_server_db: Joi.number().default(0),
});

// New: saya schema
export const sayaEnvSchema = Joi.object({
  PORT: Joi.number().port().default(8002),
  REASONING_API_KEY: Joi.string().required(),
  REASONING_BASE_URL: Joi.string().uri().required(),
  FAST_API_KEY: Joi.string().required(),
  DEBUG: Joi.boolean().default(false),
  APP_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  TAVILY_API_KEY: Joi.string().required(),
}).concat(commonEnvSchema);

// New: chan schema
export const chanEnvSchema = commonEnvSchema.append({
  PORT: Joi.number().port().default(8008),
});

// New: schedule schema
export const scheduleEnvSchema = commonEnvSchema.append({
  PORT: Joi.number().port().default(8003),
});
```

**Design Principles:**
- `commonEnvSchema`: Shared MySQL and environment config
- Use `.append()` to extend common schema
- Use `.concat()` for app-specific with common schema
- Each schema defines its own `PORT` default

### 3. .env.example Updates

Update each application's `.env.example` to include `PORT`:

**mist** (`apps/mist/src/.env.example`):
```bash
# Server Configuration
PORT=8001

# Redis Configuration
redis_server_host=localhost
redis_server_port=6379
redis_server_db=1

# MySQL Configuration
mysql_server_host=localhost
mysql_server_port=3306
mysql_server_username=root
mysql_server_password=your_secure_password_here
mysql_server_database=mist

# Environment
NODE_ENV=development
```

**saya** (`apps/saya/src/.env.example`):
```bash
# Server Configuration
PORT=8002

# LLM Configuration
REASONING_API_KEY=your_reasoning_api_key_here
REASONING_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
REASONING_MODEL=ep-20250222162205-x9gcs

FAST_API_KEY=your_fast_api_key_here
FAST_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
FAST_MODEL=ep-20250222162205-x9gcs

VL_API_KEY=your_vl_api_key_here
VL_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VL_MODEL=qwen2.5-vl-72b-instruct

# Application Settings
DEBUG=false
APP_ENV=development

# External API Keys
TAVILY_API_KEY=your_tavily_api_key_here

# MySQL Configuration
mysql_server_host=localhost
mysql_server_port=3306
mysql_server_username=root
mysql_server_password=your_secure_password_here
mysql_server_database=mist
```

**chan**, **schedule**, and **mcp-server** follow similar pattern with respective PORT defaults.

### 4. main.ts Updates

Update `main.ts` to use uppercase `PORT`:

**saya** (`apps/saya/src/main.ts`):
```typescript
// Before
await app.listen(process.env.port ?? 8002);

// After
await app.listen(process.env.PORT ?? 8002);
```

**schedule** and **mcp-server** need similar changes.

**mist** and **chan** already use `process.env.PORT` - no changes needed.

### 5. Config Module Integration

Import Joi schema in each app's `app.module.ts`:

**Example - mist** (`apps/mist/src/app.module.ts`):
```typescript
import { mistEnvSchema } from '@app/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: mistEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    // ... other imports
  ],
})
export class AppModule {}
```

**Note:** `@app/config` is the existing path alias pointing to `libs/config/src`.

### 6. Constants Library

**No changes to `libs/constants/`** - it will maintain its current simple object style:

```typescript
// libs/constants/src/errors.ts - unchanged
export const ERROR_MESSAGES = {
  INDICATOR_NOT_INITIALIZED: 'IndicatorService not initialized...',
  // ...
};
```

**Separation of Concerns:**
- `libs/config/`: Runtime configuration from environment, requires Joi validation
- `libs/constants/`: Compile-time constants, simple objects, no validation needed

## Implementation Plan

See separate implementation plan document.

## Benefits

1. **Consistency:** All apps use `PORT` for port configuration
2. **Validation:** Joi validates environment at startup, catching errors early
3. **Documentation:** `.env.example` files accurately reflect required configuration
4. **Maintainability:** Centralized schema in `libs/config` for easy updates
5. **Type Safety:** Joi validation ensures correct types
6. **Developer Experience:** Clear error messages for invalid configuration

## Files Modified

| File | Change Type |
|------|-------------|
| `libs/config/src/validation.schema.ts` | Add 4 new schemas |
| `apps/mist/src/.env.example` | Update PORT, remove nest_server_port |
| `apps/saya/src/.env.example` | Add PORT |
| `apps/schedule/src/.env.example` | Add PORT |
| `apps/chan/src/.env.example` | Add PORT |
| `apps/mcp-server/.env.example` | MCP_SERVER_PORT → PORT |
| `apps/saya/src/main.ts` | `port` → `PORT` |
| `apps/schedule/src/main.ts` | `port` → `PORT` |
| `apps/mcp-server/src/main.ts` | `MCP_SERVER_PORT` → `PORT` |
| Each app's `app.module.ts` | Import and use Joi schema |
| `libs/constants/*` | **No changes** |

## Notes

- Backward compatible: old variable names still work as fallbacks in `main.ts`
- No breaking changes to existing functionality
- mcp-server uses port 8009 to avoid conflict with chan (8008)
