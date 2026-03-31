# Unified .env Configuration Design

**Date**: 2026-03-31
**Status**: Approved

## Problem

Configuration is scattered across the monorepo:

- Root `mist/.env.example` uses different variable names (`MYSQL_USER`) than app internals (`mysql_server_username`)
- Each of the 5 apps has its own `.env` file with duplicated MySQL/Redis config
- `docker-compose.yml` manually maps between the two naming conventions
- No `.env.example` templates for individual apps — new developers don't know what to configure
- No environment-specific defaults (development vs production)

## Decision: Unified Root `.env` + Environment Split

All configuration moves to a single root `mist/.env` file. Each app's ConfigModule loads from root instead of its own directory. Environment-specific defaults are handled by `.env.development` / `.env.production` files.

## File Structure

```
mist/
├── .env                          # Actual values (gitignored)
├── .env.example                  # Complete template (committed)
├── .env.development              # Dev defaults (committed)
├── .env.production               # Prod defaults (committed)
├── docker-compose.yml            # References root .env
├── apps/
│   ├── mist/src/     (no .env)
│   ├── saya/src/     (no .env)
│   ├── chan/src/     (no .env)
│   ├── mcp-server/   (no .env)
│   └── schedule/src/ (no .env)
```

## Variable Naming

Standardize on `mysql_server_*` naming already used in Joi schemas and ConfigService.get() calls. Root `.env.example` and `docker-compose.yml` align to match.

| Old (root .env.example) | Old (docker-compose mapping) | Unified |
|--------------------------|-------------------------------|---------|
| `MYSQL_USER` | `${MYSQL_USER}` → `mysql_server_username` | `mysql_server_username` |
| `MYSQL_PASSWORD` | `${MYSQL_PASSWORD}` → `mysql_server_password` | `mysql_server_password` |
| `MYSQL_HOST` (comment) | `host.docker.internal` override | `mysql_server_host` |
| `MYSQL_PORT` (comment) | `3306` override | `mysql_server_port` |
| `MYSQL_DATABASE` (comment) | `mist` override | `mysql_server_database` |

## .env.example (Complete Template)

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

# ===== App Ports =====
# Each app reads PORT; override per-service in docker-compose
PORT=8001

# ===== Data Source =====
# ef=EastMoney, tdx=TongDaXin, mqmt=MaQiMaTe
DEFAULT_DATA_SOURCE=ef

# ===== AKTools =====
AKTOOLS_BASE_URL=http://localhost:8080

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

## Environment Default Files

### .env.development (committed)

```bash
NODE_ENV=development
mysql_server_host=localhost
AKTOOLS_BASE_URL=http://localhost:8080
```

### .env.production (committed)

```bash
NODE_ENV=production
mysql_server_host=host.docker.internal
AKTOOLS_BASE_URL=http://aktools:8080
```

The `.env` file (gitignored) takes highest priority and overrides these defaults.

## ConfigModule Loading

Each app's `ConfigModule.forRoot()` changes to load from root directory:

```typescript
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), `.env.${process.env.NODE_ENV || 'development'}`),
  ],
  validationSchema: xxxEnvSchema,
  validationOptions: { allowUnknown: true, abortEarly: false },
})
```

Files with `allowUnknown: true` so each app only validates its own required variables while still loading the full file.

### Affected Module Files

| App | File |
|-----|------|
| mist | `apps/mist/src/app.module.ts` |
| saya | `apps/saya/src/saya.module.ts` |
| chan | `apps/chan/src/chan-app.module.ts` |
| schedule | `apps/schedule/src/schedule.module.ts` |
| mcp-server | `apps/mcp-server/src/mcp-server.module.ts` |

## docker-compose.yml Simplification

Remove all manual variable mappings. Use `env_file: .env` and only override PORT per service:

```yaml
services:
  mist:
    env_file: .env
    environment:
      - PORT=8001
    # mysql_server_* comes directly from .env — no remapping needed

  mcp-server:
    env_file: .env
    environment:
      - PORT=8009
    command: ["pnpm", "run", "start:dev:mcp-server"]
```

`environment` entries override `env_file` entries, so only service-specific overrides are needed.

## nest-cli.json

Remove `.env` from assets since env files are no longer in app source directories:

```json
"compilerOptions": {
  "assets": []
}
```

## validation.schema.ts

Minimal change: add `AKTOOLS_BASE_URL` to `commonEnvSchema`:

```typescript
export const commonEnvSchema = Joi.object({
  mysql_server_host: Joi.string().hostname().required(),
  mysql_server_port: Joi.number().port().default(3306),
  mysql_server_username: Joi.string().required(),
  mysql_server_password: Joi.string().required(),
  mysql_server_database: Joi.string().required(),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  AKTOOLS_BASE_URL: Joi.string().uri().default('http://localhost:8080'),
});
```

## Files Changed Summary

| # | File | Action |
|---|------|--------|
| 1 | `mist/.env.example` | Rewrite with unified template |
| 2 | `mist/.env.development` | Create |
| 3 | `mist/.env.production` | Create |
| 4 | `mist/.env` | Create from merged app .env values |
| 5 | `mist/docker-compose.yml` | Simplify environment section |
| 6 | `mist/nest-cli.json` | Remove `**/*.env` from assets |
| 7 | `mist/libs/config/src/validation.schema.ts` | Add AKTOOLS_BASE_URL to common schema |
| 8 | `mist/apps/mist/src/app.module.ts` | Update envFilePath |
| 9 | `mist/apps/saya/src/saya.module.ts` | Update envFilePath |
| 10 | `mist/apps/chan/src/chan-app.module.ts` | Update envFilePath |
| 11 | `mist/apps/schedule/src/schedule.module.ts` | Update envFilePath |
| 12 | `mist/apps/mcp-server/src/mcp-server.module.ts` | Update envFilePath |
| 13 | `mist/apps/mist/src/.env` | Delete |
| 14 | `mist/apps/saya/src/.env` | Delete |
| 15 | `mist/apps/chan/src/.env` | Delete |
| 16 | `mist/apps/mcp-server/.env` | Delete |
