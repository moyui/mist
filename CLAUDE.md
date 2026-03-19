# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Mist** is a comprehensive stock market analysis and alert system for A-share market (沪深两市). It combines traditional technical analysis with AI-powered intelligent agents to provide trading insights and alerts.

**Architecture**: Monorepo with multiple applications and shared libraries using pnpm workspaces.

**Key Capabilities**:
- Real-time stock data collection and storage
- 164+ technical analysis indicators (MACD, RSI, KDJ, etc.)
- Chan Theory (缠论) automated analysis
- Multi-agent AI system for intelligent trading decisions
- RESTful API with Swagger documentation
- MCP Server for AI application integration

## Quick Start

```bash
# Install dependencies
pnpm install

# Development - run specific app in watch mode
pnpm run start:dev:mist     # Main stock analysis (port 8001)
pnpm run start:dev:saya     # AI Agent system (port 8002)
pnpm run start:dev:schedule # Scheduled tasks (port 8003)
pnpm run start:dev:chan     # Chan Theory test entry (port 8008)
pnpm run start:dev:mcp-server # MCP server (port 8009)

# Build all projects
pnpm run build

# Code quality
pnpm run lint               # ESLint
pnpm run format             # Prettier

# Testing
pnpm run test               # Unit tests
pnpm run test:e2e           # E2E tests
pnpm run test:cov           # Coverage
pnpm run test:watch         # Watch mode
```

---

## Architecture

### Applications (`apps/`)

All applications use a standardized `PORT` environment variable with Joi validation for type safety.

| App | Purpose | Port | Key Features |
|-----|---------|------|--------------|
| **mist** | Main stock analysis application | 8001 | Data collection, technical indicators, Chan Theory analysis |
| **saya** | AI Agent system | 8002 | Multi-agent analysis using LangChain/LangGraph |
| **schedule** | Scheduled task runner | 8003 | Periodic data collection and analysis |
| **chan** | Chan Theory test/debug entry | 8008 | K-line merge, Bi (stroke) calculation, Channel detection |
| **mcp-server** | MCP server for AI integration | 8009 | Model Context Protocol server |

### Libraries (`libs/`)

| Library | Purpose | Key Contents |
|---------|---------|--------------|
| **prompts** | AI agent prompt templates | Commander, DataEngineer, Strategist, etc. |
| **config** | Configuration management | Environment-specific configs |
| **utils** | Shared utilities | Common helper functions |
| **timezone** | Time zone handling | Uses date-fns-tz |
| **shared-data** | Data models and entities | Stock index entities, TypeORM models |
| **constants** | Constants | Time periods, trend directions, etc. |

---

## AI Agent System (saya)

The AI system uses a multi-agent architecture with specialized roles:

### Agent Roles

1. **Commander** - Receives user commands, plans tasks, coordinates agents
2. **DataEngineer** - Data acquisition, processing, calculation, vector storage
3. **Strategist** - Applies predefined strategy rules, outputs buy/sell signals
4. **PatternFinder** - Historical pattern matching and probability analysis
5. **SentimentAnalyst** - News/social media sentiment analysis
6. **Reporter** - Generates reports and alerts
7. **RiskMonitor** - Market and portfolio risk monitoring

See `Roadmap.md` for the detailed agent workflow diagram.

---

## Path Mappings

```typescript
@app/prompts     → libs/prompts/src
@app/config      → libs/config/src
@app/utils       → libs/utils/src
@app/timezone    → libs/timezone/src
@app/shared-data → libs/shared-data/src
@app/constants   → libs/constants/src
```

---

## Data Pipeline

### Data Source

**AKTools** (https://aktools.akfamily.xyz) - Local Python FastAPI server for stock data

### Python Environment Setup

```bash
# Create virtual environment
python3 -m venv python-env

# Activate
source python-env/bin/activate  # Windows: python-env\Scripts\activate

# Install AKTools
python3 -m pip install aktools

# Start server
python3 -m aktools
```

**Note**: AKTools does not warn when port is occupied. Ensure port 8080 is available.

### Database

- **Type**: MySQL with TypeORM
- **Database creation**: `CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;`
- **Configuration**: Environment-based (see `.env.example` files)

### Time Periods

Data is stored for multiple timeframes:
- **1min, 5min, 15min, 30min, 60min** - Intraday periods
- **daily** - Daily period

---

## Technical Analysis

### Implemented Indicators

Using **node-talib** (164+ supported functions - see `Talib.md`):

- **MACD** - Moving Average Convergence Divergence
- **RSI** - Relative Strength Index
- **KDJ** - Stochastic Oscillator
- **ADX** - Average Directional Index
- **ATR** - Average True Range

### Chan Theory (缠论) Module

**Location**: `apps/mist/src/chan/`

**Components**:
- **Merge K (合并K)** - Groups consecutive K-lines based on containment relationships
- **Fenxing (分型)** - Identifies top and bottom patterns
- **Bi (笔)** - Identifies significant price movements (trend lines)
- **Channel (中枢)** - Identifies consolidation zones

**Key Services**:
- `merge-k.service.ts` - K-line merging logic
- `fenxing.service.ts` - Fenxing detection
- `bi.service.ts` - Bi recognition (4-step algorithm with rollback)
- `channel.service.ts` - Channel detection with extension logic

**Test Entry**: `apps/chan/` (Port 8008)

---

## Test Data Management

### Directory Structure

```
mist/test-data/
├── fixtures/               # Test input data
│   └── k-line/            # K-line raw data for different test scenarios
│       ├── shanghai-index-2024-2025.fixture.ts
│       ├── csi-300-2024-2025-simple.ts
│       └── ...
└── test-results/          # Test output
    ├── raw/               # JSON results from test runs
    │   ├── shanghai-index-2024-2025-results.json
    │   └── ...
    └── types/             # Auto-generated TypeScript definitions
        ├── shanghai-index-2024-2025-results.ts
        └── ...
```

### Test Data Workflow

```bash
# Run tests and generate results
pnpm run test:full         # Run tests + generate types

# Generate TypeScript definitions only
pnpm run test:gen-types    # Generate .ts files from JSON results
```

### Test Data Structure

1. Run backend tests → Generate JSON in `test-data/test-results/raw/`
2. Auto-generate TypeScript definitions in `test-data/test-results/types/`
3. Import in tests: `import { shanghaiIndex20242025Results } from '@test-data/results/types'`

---

## Development Guidelines

### Code Organization

- **Controllers** - HTTP request handlers (`*.controller.ts`)
- **Services** - Business logic (`*.service.ts`)
- **DTOs** - Data transfer objects (`dto/*.ts`)
- **Entities** - Database models (`entities/*.ts`)
- **Modules** - Feature organization (`*.module.ts`)

### Testing

**Test locations**:
- Unit tests: `**/*.spec.ts` (alongside source files)
- E2E tests: `apps/*/test/*.e2e-spec.ts`
- Chan Theory tests: `apps/mist/src/chan/test/`

**Running tests**:
```bash
# All tests
pnpm run test

# Specific test
pnpm run test:chan:shanghai-2024-2025

# Watch mode
pnpm run test:watch

# Coverage
pnpm run test:cov
```

### Database Migrations

```bash
# Generate migration
pnpm run migration:generate -- -n MigrationName

# Run migrations
pnpm run migration:run

# Revert migration
pnpm run migration:revert
```

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| **@nestjs/core** | NestJS framework |
| **@nestjs/schedule** | Cron jobs for scheduled tasks |
| **@langchain/langgraph** | AI agent orchestration |
| **@langchain/deepseek** | DeepSeek LLM integration |
| **talib** | Technical analysis library |
| **typeorm** | MySQL ORM |
| **date-fns-tz** | Timezone handling |
| **axios** | HTTP client for AKTools |

---

## API Endpoints

### Main App (Port 8001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/app/hello` | GET | Health check |
| `/indicator/k` | POST | K-line data |
| `/indicator/macd` | POST | MACD calculation |
| `/indicator/rsi` | POST | RSI calculation |
| `/indicator/kdj` | POST | KDJ calculation |
| `/chan/merge-k` | POST | K-line merging |
| `/chan/bi` | POST | Bi recognition |
| `/chan/channel` | POST | Channel detection |

**Swagger UI**: http://localhost:8001/api-docs

### Unified Response Format

All HTTP endpoints return responses in a unified format:

**Success Response:**
```json
{
  "success": true,
  "code": 200,
  "message": "SUCCESS",
  "data": { /* actual response data */ },
  "timestamp": "2026-03-19T10:30:00.000Z",
  "requestId": "http-1710819800000-abc123xyz"
}
```

**Error Response:**
```json
{
  "success": false,
  "code": 1001,
  "message": "INVALID_PARAMETER",
  "timestamp": "2026-03-19T10:30:00.000Z",
  "requestId": "err-1710819800000-def456uvw"
}
```

**Error Code Ranges:**
- `200`: Success
- `1xxx`: Client errors (parameter validation, format errors)
- `2xxx`: Business errors (data not found, insufficient data)
- `5xxx`: Server errors (database, external services)

### Chan Test Entry (Port 8008)

Special endpoint for testing Chan Theory algorithms with detailed debugging output.

---

## Known Issues

1. **AKTools Port**: AKTools does not warn when port 8080 is occupied, causing silent failures
2. **Timezone**: date-fns-tz requires proper timezone configuration
3. **Chan Theory**: Algorithm may need tuning for different market conditions

---

## License

BSD-3-Clause
