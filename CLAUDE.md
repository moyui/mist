# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Mist** is a stock market analysis system for A-shares (沪深两市). NestJS monorepo with 5 apps and 6 shared libs using pnpm workspaces. Uses MySQL + TypeORM, AKTools for data, and LangGraph for AI agents.

## Commands

```bash
pnpm install                        # Install dependencies

# Development (watch mode)
pnpm run start:dev:mist             # Main app - port 8001
pnpm run start:dev:saya             # AI agents - port 8002
pnpm run start:dev:schedule         # Scheduled tasks - port 8003
pnpm run start:dev:chan             # Chan Theory test entry - port 8008
pnpm run start:dev:mcp-server       # MCP server - port 8009

# Debug mode
pnpm run start:debug:chan
pnpm run start:debug:mcp-server

# Build
pnpm run build

# Code quality
pnpm run lint                       # ESLint (with --fix)
pnpm run format                     # Prettier

# Testing
pnpm run test                       # Unit tests (all apps + libs)
pnpm run test:watch                 # Watch mode
pnpm run test:cov                   # Coverage
pnpm run test:e2e                   # E2E tests (mist app)
pnpm run test:chan:shanghai-2024-2025  # Specific Chan Theory test
pnpm run test:full                  # Run tests + sync results to frontend
pnpm run test:gen-types             # Generate TS types from JSON test results
pnpm run test:deep                  # Deep integration tests
pnpm run test:deep:watch            # Watch deep tests

# Database migrations
pnpm run migration:generate -- -n MigrationName
pnpm run migration:run
pnpm run migration:revert
```

## Architecture

### Apps

| App | Port | Purpose | Key Modules |
|-----|------|---------|-------------|
| **mist** | 8001 | Main stock analysis | chan, collector, indicator, security, sources |
| **saya** | 8002 | AI multi-agent system | agents, builder, llm, role, template, tools |
| **schedule** 8003 | Periodic data collection | Reuses CollectorModule from mist |
| **chan** | 8008 | Chan Theory test/debug | Imports ChanModule from mist |
| **mcp-server** | 8009 | MCP server for AI integration | 5 MCP services (Chan, Indicator, Data, Schedule, Segment) |

### Cross-App Module Sharing

Apps reuse modules from `apps/mist/src/` via direct imports:
- **chan app** imports `ChanModule` from `../../mist/src/chan/chan.module`
- **schedule app** imports `CollectorModule` from mist
- **mcp-server** imports `ChanModule`, `IndicatorModule`, and `UtilsModule`

### Key Architectural Patterns

**Strategy Pattern for Data Collection** (`apps/mist/src/collector/strategies/`):
- `IDataCollectionStrategy` interface with `source` property
- `CollectionStrategyRegistry` resolves strategies by `DataSource` enum
- Each source (East Money, etc.) implements the interface
- Registry injected via `COLLECTION_STRATEGIES` Symbol token

**Data Source Adapters** (`apps/mist/src/sources/`):
- `source-fetcher.interface.ts` defines the fetcher contract
- Separate implementations per source: `east-money.source.ts`, `tdx.source.ts`
- `DataSourceService` (in `@app/utils`) manages source selection and validation

**Entity Extension Pattern** (`libs/shared-data/src/entities/`):
- Base `K` entity for common K-line fields
- Source-specific extension entities: `KExtensionEf`, `KExtensionTdx`, `KExtensionMqmt`
- All entities registered in app.module.ts TypeORM config

**Multi-Agent Architecture** (saya app):
- 7 agent roles: Commander, DataEngineer, Strategist, PatternFinder, SentimentAnalyst, Reporter, RiskMonitor
- LangGraph orchestration with DeepSeek LLM
- Prompt templates in `libs/prompts/`

### Libraries (`libs/`)

| Library | Import | Purpose |
|---------|--------|---------|
| **prompts** | `@app/prompts` | AI agent prompt templates |
| **config** | `@app/config` | Joi validation schemas per app (e.g. `mistEnvSchema`, `chanEnvSchema`) |
| **utils** | `@app/utils` | `DataSourceService`, `PeriodMappingService` |
| **timezone** | `@app/timezone` | Timezone service (date-fns-tz) |
| **shared-data** | `@app/shared-data` | Entities (`K`, `Security`, `SecuritySourceConfig`, source extensions) and enums (`DataSource`, `Period`, `SecurityStatus`, `SecurityType`) |
| **constants** | `@app/constants` | Error codes (1xxx client, 2xxx business, 5xxx server) |

### Path Mappings

```typescript
@app/prompts        → libs/prompts/src
@app/config         → libs/config/src
@app/utils          → libs/utils/src
@app/timezone       → libs/timezone/src
@app/shared-data    → libs/shared-data/src
@app/constants      → libs/constants/src
@app/data-collector → apps/mist/src/data-collector
@test-data          → test-data/
```

## Data Sources

Three sources with enum values in `DataSource` (ef/tdx/mqmt). Configured via `DEFAULT_DATA_SOURCE` env var.

- **ef** (East Money) - default for mist app
- **tdx** (TongDaXin) - default for chan app
- **mqmt** (MaQiMaTe) - alternative source

All data query endpoints accept optional `source` parameter. `DataSourceService.select()` resolves the effective source.

## Environment

Copy `.env.example` to `.env`. Key variables:

- MySQL: `mysql_server_host/port/username/password/database`
- Redis: `redis_server_host/port/db`
- Data source: `DEFAULT_DATA_SOURCE` (ef/tdx/mqmt)
- AKTools: `AKTOOLS_BASE_URL` (default http://localhost:8080)
- LLM (saya): `REASONING_*`, `FAST_*`, `VL_*` model configs, `TAVILY_API_KEY`

Ports are hardcoded as defaults in each app's `main.ts`. Override via `PORT` env var or docker-compose.

## Unified Response Format

All HTTP endpoints wrap responses in:
```json
{ "success": true/false, "code": 200, "message": "...", "data": {}, "timestamp": "...", "requestId": "..." }
```

## Test Data

- Fixtures: `test-data/fixtures/k-line/` (input data)
- Results: `test-data/test-results/raw/` (JSON output)
- Types: `test-data/test-results/types/` (auto-generated TS definitions)
- Import pattern: `import { xxx } from '@test-data/results/types'`

## Code Conventions

- NestJS standard: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `entities/`
- Unit tests: `*.spec.ts` alongside source files
- E2E tests: `apps/*/test/*.e2e-spec.ts`
- Chan Theory tests: `apps/mist/src/chan/test/`
- Deep integration tests: `test-integration/deep-test/`
- Config validation uses Joi schemas from `@app/config`
- Husky + lint-staged pre-commit hooks run ESLint + Prettier on `*.ts` files
- Source type naming: `{Source}{Purpose}` — prefix by data source (`Ef`/`Tdx`/`Mqmt`), suffix by usage: `Extension` (DB fields), `Response` (HTTP API response), `Snapshot` (WebSocket data). Examples: `EfExtension`, `EfMinuteResponse`, `TdxExtension`, `TdxResponse`, `TdxSnapshot`
