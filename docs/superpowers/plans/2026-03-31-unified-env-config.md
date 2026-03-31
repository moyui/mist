# Unified .env Configuration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all scattered .env files into a single root `.env` with environment-specific defaults, unify variable naming, and simplify docker-compose.yml.

**Architecture:** A single root `mist/.env` file holds all configuration. Each NestJS app's `ConfigModule` loads from root using `process.cwd()` with a two-file priority: `.env.${NODE_ENV}` (base defaults) → `.env` (secrets override). Ports stay out of `.env` — each app uses its `main.ts` hardcoded default.

**Tech Stack:** NestJS @nestjs/config, Joi validation, Docker Compose, TypeORM

**Spec:** `docs/superpowers/specs/2026-03-31-unified-env-config-design.md`

---

## File Map

| File | Responsibility | Action |
|------|---------------|--------|
| `mist/.env.example` | Complete template for all apps | Rewrite |
| `mist/.env.development` | Dev defaults (no secrets) | Create |
| `mist/.env.production` | Prod defaults (no secrets) | Create |
| `mist/.env` | Actual values (gitignored) | Create |
| `mist/docker-compose.yml` | Simplified env injection | Modify |
| `mist/nest-cli.json` | Remove .env from build assets | Modify |
| `mist/libs/config/src/validation.schema.ts` | Add AKTOOLS_BASE_URL + saya LLM vars | Modify |
| `mist/apps/mist/src/app.module.ts` | Update envFilePath to root | Modify |
| `mist/apps/saya/src/saya.module.ts` | Update envFilePath, keep load | Modify |
| `mist/apps/chan/src/chan-app.module.ts` | Update envFilePath to root | Modify |
| `mist/apps/schedule/src/schedule.module.ts` | Update envFilePath to root | Modify |
| `mist/apps/mcp-server/src/mcp-server.module.ts` | Update envFilePath to root | Modify |
| `mist/apps/mist/src/.env` | Remove | Delete |
| `mist/apps/mist/src/.env.example` | Remove | Delete |
| `mist/apps/saya/src/.env` | Remove | Delete |
| `mist/apps/saya/src/.env.example` | Remove | Delete |
| `mist/apps/chan/src/.env` | Remove | Delete |
| `mist/apps/chan/src/.env.example` | Remove | Delete |
| `mist/apps/schedule/src/.env` | Remove | Delete |
| `mist/apps/schedule/src/.env.example` | Remove | Delete |
| `mist/apps/mcp-server/.env` | Remove (uppercase vars) | Delete |
| `mist/apps/mcp-server/.env.example` | Remove | Delete |
| `mist/apps/mcp-server/src/.env` | Remove | Delete |
| `mist/apps/mcp-server/src/.env.example` | Remove | Delete |

---

## Task 1: Update validation schema

**Files:**
- Modify: `mist/libs/config/src/validation.schema.ts`

This task comes first because the schema changes are independent and the app module changes (Task 2) depend on the updated schemas compiling correctly.

- [ ] **Step 1: Add `AKTOOLS_BASE_URL` to `commonEnvSchema`**

In `mist/libs/config/src/validation.schema.ts`, add `AKTOOLS_BASE_URL` to the `commonEnvSchema` object after the `NODE_ENV` entry:

```typescript
// Change this (line 7-19):
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

// To this:
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
```

- [ ] **Step 2: Add missing saya LLM variables to `sayaEnvSchema`**

Replace the `sayaEnvSchema` (lines 35-45):

```typescript
// From:
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
}).concat(commonEnvSchema);

// To:
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
```

- [ ] **Step 3: Commit**

```bash
git add libs/config/src/validation.schema.ts
git commit -m "feat: add AKTOOLS_BASE_URL to common schema and saya LLM variables"
```

---

## Task 2: Update all app modules to load from root

**Files:**
- Modify: `mist/apps/mist/src/app.module.ts`
- Modify: `mist/apps/saya/src/saya.module.ts`
- Modify: `mist/apps/chan/src/chan-app.module.ts`
- Modify: `mist/apps/schedule/src/schedule.module.ts`
- Modify: `mist/apps/mcp-server/src/mcp-server.module.ts`

Each module needs the same `envFilePath` change. The `path` import can be kept (still used for `path.resolve`).

- [ ] **Step 1: Update `mist/apps/mist/src/app.module.ts`**

Replace lines 24-31 (the `ConfigModule.forRoot` block):

```typescript
// From:
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.join(__dirname, '.env'),
      validationSchema: mistEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

// To:
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), `.env.${process.env.NODE_ENV || 'development'}`),
        path.resolve(process.cwd(), '.env'),
      ],
      validationSchema: mistEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
```

- [ ] **Step 2: Update `mist/apps/saya/src/saya.module.ts`**

Replace lines 16-25 (the `ConfigModule.forRoot` block). **Must preserve `load: CONFIG_REGISTER`:**

```typescript
// From:
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.join(__dirname, '.env'),
      load: CONFIG_REGISTER,
      validationSchema: sayaEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

// To:
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), `.env.${process.env.NODE_ENV || 'development'}`),
        path.resolve(process.cwd(), '.env'),
      ],
      load: CONFIG_REGISTER,
      validationSchema: sayaEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
```

- [ ] **Step 3: Update `mist/apps/chan/src/chan-app.module.ts`**

Replace lines 8-15 (the `ConfigModule.forRoot` block). **Note: this module has no `envFilePath` currently — add it:**

```typescript
// From:
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: chanEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

// To:
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), `.env.${process.env.NODE_ENV || 'development'}`),
        path.resolve(process.cwd(), '.env'),
      ],
      validationSchema: chanEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
```

Also add the `path` import at the top of the file. Add `import * as path from 'path';` after the existing imports:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { chanEnvSchema } from '@app/config';
import { ChanModule } from '../../mist/src/chan/chan.module';
import * as path from 'path';
```

- [ ] **Step 4: Update `mist/apps/schedule/src/schedule.module.ts`**

Replace lines 13-20 (the `ConfigModule.forRoot` block). **Note: no `envFilePath` currently — add it:**

```typescript
// From:
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: scheduleEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

// To:
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), `.env.${process.env.NODE_ENV || 'development'}`),
        path.resolve(process.cwd(), '.env'),
      ],
      validationSchema: scheduleEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
```

Also add the `path` import. Add `import * as path from 'path';` after the existing imports (after line 6):

```typescript
import { Security, K, SecuritySourceConfig } from '@app/shared-data';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { scheduleEnvSchema } from '@app/config';
import * as path from 'path';
```

- [ ] **Step 5: Update `mist/apps/mcp-server/src/mcp-server.module.ts`**

Replace lines 19-27 (the `ConfigModule.forRoot` block):

```typescript
// From:
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.join(__dirname, '.env'),
      validationSchema: mcpEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

// To:
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), `.env.${process.env.NODE_ENV || 'development'}`),
        path.resolve(process.cwd(), '.env'),
      ],
      validationSchema: mcpEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
```

- [ ] **Step 6: Commit**

```bash
git add apps/mist/src/app.module.ts apps/saya/src/saya.module.ts apps/chan/src/chan-app.module.ts apps/schedule/src/schedule.module.ts apps/mcp-server/src/mcp-server.module.ts
git commit -m "refactor: update all app modules to load env from monorepo root"
```

---

## Task 3: Update nest-cli.json

**Files:**
- Modify: `mist/nest-cli.json`

Remove `.env` file copying from build assets since .env files no longer live in app source directories.

- [ ] **Step 1: Remove assets config**

Remove lines 8-10 (`"assets": ["**/*.env"]`) from `nest-cli.json`. The `compilerOptions` should become:

```json
  "compilerOptions": {
    "deleteOutDir": true,
    "watchAssets": true,
    "webpack": true,
    "webpackConfigPath": "webpack.config.js",
    "tsConfigPath": "apps/mist/tsconfig.app.json"
  },
```

- [ ] **Step 2: Commit**

```bash
git add nest-cli.json
git commit -m "refactor: remove .env from nest-cli build assets"
```

---

## Task 4: Simplify docker-compose.yml

**Files:**
- Modify: `mist/docker-compose.yml`

Remove manual variable mappings. The unified `.env` already has `mysql_server_*` with correct naming. Only keep per-service PORT overrides and Docker-specific host overrides.

- [ ] **Step 1: Simplify `mist` service environment**

Replace lines 19-44 (the `mist` service):

```yaml
# From:
  mist:
    container_name: mist-backend
    image: ghcr.io/${REPO_OWNER:-moyui}/mist:${VERSION:-latest}
    env_file:
      - .env
    ports:
      - "8001:8001"  # Main mist app
      - "8008:8008"  # Chan test entry
    environment:
      - mysql_server_host=host.docker.internal
      - mysql_server_port=3306
      - mysql_server_username=${MYSQL_USER}
      - mysql_server_password=${MYSQL_PASSWORD}
      - mysql_server_database=mist
      - NODE_ENV=${NODE_ENV:-production}
      - AKTOOLS_BASE_URL=http://aktools:8080
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - mist-network
    volumes:
      - ./logs:/app/logs
    depends_on:
      aktools:
        condition: service_healthy
    restart: unless-stopped

# To:
  mist:
    container_name: mist-backend
    image: ghcr.io/${REPO_OWNER:-moyui}/mist:${VERSION:-latest}
    env_file:
      - .env
    ports:
      - "8001:8001"  # Main mist app
      - "8008:8008"  # Chan test entry
    environment:
      - mysql_server_host=host.docker.internal
      - AKTOOLS_BASE_URL=http://aktools:8080
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - mist-network
    volumes:
      - ./logs:/app/logs
    depends_on:
      aktools:
        condition: service_healthy
    restart: unless-stopped
```

Key changes: removed `mysql_server_port`, `mysql_server_username`, `mysql_server_password`, `mysql_server_database`, `NODE_ENV` from environment — these come directly from `.env`. Kept `mysql_server_host=host.docker.internal` (Docker override) and `AKTOOLS_BASE_URL=http://aktools:8080` (Docker network URL).

- [ ] **Step 2: Simplify `mcp-server` service environment**

Replace lines 46-70 (the `mcp-server` service):

```yaml
# From:
  mcp-server:
    container_name: mist-mcp-server
    image: ghcr.io/${REPO_OWNER:-moyui}/mist:${VERSION:-latest}
    env_file:
      - .env
    ports:
      - "8009:8009"  # MCP server
    environment:
      - PORT=8009
      - mysql_server_host=host.docker.internal
      - mysql_server_port=3306
      - mysql_server_username=${MYSQL_USER}
      - mysql_server_password=${MYSQL_PASSWORD}
      - mysql_server_database=mist
      - NODE_ENV=${NODE_ENV:-production}
      - AKTOOLS_BASE_URL=http://aktools:8080
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - mist-network
    depends_on:
      aktools:
        condition: service_healthy
    restart: unless-stopped
    command: ["pnpm", "run", "start:dev:mcp-server"]

# To:
  mcp-server:
    container_name: mist-mcp-server
    image: ghcr.io/${REPO_OWNER:-moyui}/mist:${VERSION:-latest}
    env_file:
      - .env
    ports:
      - "8009:8009"  # MCP server
    environment:
      - PORT=8009
      - mysql_server_host=host.docker.internal
      - AKTOOLS_BASE_URL=http://aktools:8080
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - mist-network
    depends_on:
      aktools:
        condition: service_healthy
    restart: unless-stopped
    command: ["pnpm", "run", "start:dev:mcp-server"]
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "refactor: simplify docker-compose env config to use unified .env"
```

---

## Task 5: Create new root env files

**Files:**
- Rewrite: `mist/.env.example`
- Create: `mist/.env.development`
- Create: `mist/.env.production`
- Create: `mist/.env` (gitignored, from merged app values)

- [ ] **Step 1: Rewrite `mist/.env.example`**

Replace entire file with:

```bash
# ===== Node Environment =====
NODE_ENV=development

# ===== MySQL =====
mysql_server_host=localhost
mysql_server_port=3306
mysql_server_username=root
mysql_server_password=your_password_here
mysql_server_database=mist

# ===== Redis =====
redis_server_host=localhost
redis_server_port=6379
redis_server_db=0

# ===== Data Source =====
# ef=EastMoney, tdx=TongDaXin, mqmt=MaQiMaTe
DEFAULT_DATA_SOURCE=ef

# ===== AKTools =====
AKTOOLS_BASE_URL=http://localhost:8080

# ===== App Ports =====
# Ports are NOT set in shared .env. Each app uses its hardcoded default
# in main.ts (process.env.PORT ?? <default>). Docker overrides per-service
# via docker-compose.yml environment section.
# To override locally, set PORT env var when starting: PORT=8002 pnpm run start:dev:saya

# ===== LLM (saya only) =====
REASONING_API_KEY=
REASONING_BASE_URL=
REASONING_MODEL=
FAST_API_KEY=
FAST_BASE_URL=
FAST_MODEL=
VL_API_KEY=
VL_BASE_URL=
VL_MODEL=
TAVILY_API_KEY=

# ===== Saya Settings =====
DEBUG=false
APP_ENV=development

# ===== Docker Deployment =====
REPO_OWNER=moyui
VERSION=latest
```

- [ ] **Step 2: Create `mist/.env.development`**

```bash
NODE_ENV=development
mysql_server_host=localhost
AKTOOLS_BASE_URL=http://localhost:8080
```

- [ ] **Step 3: Create `mist/.env.production`**

```bash
NODE_ENV=production
mysql_server_host=host.docker.internal
AKTOOLS_BASE_URL=http://aktools:8080
```

- [ ] **Step 4: Create `mist/.env` from merged app values**

Merge all app `.env` values into one file. Use actual values from each app's `.env`:

```bash
# ===== Node Environment =====
NODE_ENV=development

# ===== MySQL (from mist app) =====
mysql_server_host=localhost
mysql_server_port=3306
mysql_server_username=root
mysql_server_password=123456
mysql_server_database=mist

# ===== Redis (from mist app) =====
redis_server_host=localhost
redis_server_port=6379
redis_server_db=1

# ===== Data Source =====
DEFAULT_DATA_SOURCE=ef

# ===== AKTools =====
AKTOOLS_BASE_URL=http://localhost:8080

# ===== LLM (from saya app) =====
REASONING_API_KEY=your_reasoning_api_key_here
REASONING_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
REASONING_MODEL=ep-20250222162205-x9gcs
FAST_API_KEY=your_fast_api_key_here
FAST_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
FAST_MODEL=ep-20250222162205-x9gcs
VL_API_KEY=your_vl_api_key_here
VL_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VL_MODEL=qwen2.5-vl-72b-instruct

# ===== Saya Settings =====
DEBUG=false
APP_ENV=development
TAVILY_API_KEY=your_tavily_api_key_here

# ===== Docker Deployment =====
REPO_OWNER=moyui
VERSION=latest
```

**Note to implementer:** Copy the REAL API key values from `apps/saya/src/.env` into this file. The values shown above are from the saya `.env` — update with actual secrets if they differ.

- [ ] **Step 5: Commit**

```bash
git add .env.example .env.development .env.production
# Do NOT add .env — it is gitignored
git commit -m "feat: create unified root env files with environment defaults"
```

---

## Task 6: Delete old app .env files and clean dist

**Files:**
- Delete: `mist/apps/mist/src/.env`
- Delete: `mist/apps/mist/src/.env.example`
- Delete: `mist/apps/saya/src/.env`
- Delete: `mist/apps/saya/src/.env.example`
- Delete: `mist/apps/chan/src/.env`
- Delete: `mist/apps/chan/src/.env.example`
- Delete: `mist/apps/schedule/src/.env`
- Delete: `mist/apps/schedule/src/.env.example`
- Delete: `mist/apps/mcp-server/.env`
- Delete: `mist/apps/mcp-server/.env.example`
- Delete: `mist/apps/mcp-server/src/.env`
- Delete: `mist/apps/mcp-server/src/.env.example`
- Clean: `mist/dist/` (stale copied .env files)

- [ ] **Step 1: Delete all app-level .env and .env.example files**

```bash
git rm apps/mist/src/.env apps/mist/src/.env.example
git rm apps/saya/src/.env apps/saya/src/.env.example
git rm apps/chan/src/.env apps/chan/src/.env.example
git rm apps/schedule/src/.env apps/schedule/src/.env.example
git rm apps/mcp-server/.env apps/mcp-server/.env.example
git rm apps/mcp-server/src/.env apps/mcp-server/src/.env.example
```

- [ ] **Step 2: Clean dist directory**

```bash
rm -rf dist/
```

This removes stale `.env` files copied during previous builds (`dist/apps/saya/.env`, `dist/apps/mist/.env`).

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: remove per-app .env files in favor of unified root .env"
```

---

## Task 7: Verify

- [ ] **Step 1: Verify mist app starts**

```bash
cd mist && timeout 15 pnpm run start:dev:mist 2>&1 | head -30
```

Expected: Application starts on port 8001, no config validation errors.

- [ ] **Step 2: Verify chan app starts**

```bash
cd mist && timeout 15 pnpm run start:dev:chan 2>&1 | head -30
```

Expected: Application starts on port 8008.

- [ ] **Step 3: Commit verification**

If all apps start correctly, no additional commit needed. If fixes were required, commit them:

```bash
git add -A
git commit -m "fix: resolve config issues from env unification"
```
