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
- Multi-data source management (East Money, TDX, AKTools)
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
| **utils** | Shared utilities | DataSourceService, PeriodMappingService, validation helpers |
| **timezone** | Time zone handling | Uses date-fns-tz |
| **shared-data** | Data models and entities | Stock index entities, TypeORM models |
| **constants** | Constants | Time periods, trend directions, error codes |

### Core Services (in `apps/mist/src/`)

| Service | Purpose | Location |
|---------|---------|----------|
| **DataSourceService** | Multi-data source selection and validation | `common/data-source.service.ts` |
| **PeriodMappingService** | Period string to enum mapping | `common/period-mapping.service.ts` |
| **DataService** | Unified data query interface | `data/data.service.ts` |
| **SecurityService** | Stock/security management | `security/security.service.ts` |
| **CollectorService** | Data collection orchestration | `collector/collector.service.ts` |

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

### Multi-Data Source Architecture

The system supports multiple data sources for K-line data collection and querying:

#### Data Sources

| Source | Code | Description | Default For |
|--------|------|-------------|-------------|
| **East Money** | `ef` | 东方财富 - Comprehensive market data | mist app |
| **TongDaXin** | `tdx` | 通达信 - Professional trading platform data | chan app |
| **MaQiMaTe** | `mqmt` | 迈吉马克特 - Alternative data source | mcp-server |

#### Data Source Selection

The `DataSourceService` (`@app/utils`) manages source selection:

```typescript
// Automatic selection (uses app default)
const source = dataSourceService.select();  // Returns 'ef' for mist app

// Explicit selection
const source = dataSourceService.select('tdx');  // Returns 'tdx'

// Invalid source throws exception
dataSourceService.select('invalid');  // Throws Error
```

#### Environment Configuration

Each application can configure its default data source via environment variables:

```bash
# .env files
DEFAULT_DATA_SOURCE=ef          # East Money (default for mist)
DEFAULT_DATA_SOURCE=tdx         # TongDaXin (default for chan)
DEFAULT_DATA_SOURCE=mqmt        # MaQiMaTe
```

### Data Collection

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
- **K-line entity** includes `source` field to track data origin

### Time Periods

Data is stored for multiple timeframes:
- **1min, 5min, 15min, 30min, 60min** - Intraday periods
- **daily** - Daily period

Each K-line record includes:
- `timestamp` - Time of the candlestick
- `period` - Time period enum
- `source` - Data source (ef/tdx/mqmt)
- OHLCV data (open, high, low, close, volume, amount)

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

## Multi-Data Source Usage Examples

### Query K-line Data with Source Selection

```bash
# Using default source (ef for mist app)
curl -X POST http://localhost:8001/indicator/k \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "period": "5min",
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-02T00:00:00Z"
  }'

# Explicitly using TongDaXin source
curl -X POST http://localhost:8001/indicator/k \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "period": "5min",
    "source": "tdx",
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-02T00:00:00Z"
  }'

# Using MaQiMaTe source
curl -X POST http://localhost:8001/indicator/macd \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "period": "daily",
    "source": "mqmt"
  }'
```

### Chan Theory Analysis with Source

```bash
# Query Bi (笔) recognition with specific source
curl -X POST http://localhost:8001/chan/bi \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "period": "30min",
    "source": "ef",
    "startDate": "2024-01-01T00:00:00Z"
  }'
```

### Initialize Stock and Configure Data Source

The API now uses a two-step process for stock initialization:

#### Step 1: Initialize Stock

```bash
# Initialize a new stock (without source configuration)
curl -X POST http://localhost:8001/v1/security/init \
  -H "Content-Type: application/json" \
  -d '{
    "code": "000001.SH",
    "name": "平安银行",
    "type": "stock"
  }'
```

#### Step 2: Add Data Source

```bash
# Add data source configuration (can be called multiple times for different sources)
curl -X POST http://localhost:8001/v1/security/add-source \
  -H "Content-Type: application/json" \
  -d '{
    "code": "000001.SH",
    "source": {
      "type": "aktools",
      "config": "{}"
    }
  }'
```

**Benefits:**
- Separates concerns: stock initialization vs. data source configuration
- Allows adding multiple data sources to the same stock
- Enables updating source configuration without re-initializing the stock

### Error Handling

```bash
# Invalid source returns error
curl -X POST http://localhost:8001/indicator/k \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "period": "5min",
    "source": "invalid_source"
  }'

# Response:
# {
#   "success": false,
#   "code": 1001,
#   "message": "Invalid data source: invalid_source. Valid sources: ef, tdx, mqmt",
#   "timestamp": "2024-03-22T10:30:00.000Z",
#   "requestId": "err-1710819800000-abc123"
# }
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

### Main App (Port 8001) - API Version 2.0

#### Multi-Data Source Support

All data query endpoints now support an optional `source` parameter to specify which data source to use:

- **ef** - East Money (东方财富, default)
- **tdx** - TongDaXin (通达信)
- **mqmt** - MaQiMaTe (迈吉马克特)

If no source is specified, the application default is used.

#### Indicator Endpoints

| Endpoint | Method | Description | Source Parameter |
|----------|--------|-------------|------------------|
| `/indicator/k` | POST | K-line data query | Optional (ef/tdx/mqmt) |
| `/indicator/macd` | POST | MACD calculation | Optional (ef/tdx/mqmt) |
| `/indicator/rsi` | POST | RSI calculation | Optional (ef/tdx/mqmt) |
| `/indicator/kdj` | POST | KDJ calculation | Optional (ef/tdx/mqmt) |
| `/indicator/adx` | POST | ADX calculation | Optional (ef/tdx/mqmt) |
| `/indicator/atr` | POST | ATR calculation | Optional (ef/tdx/mqmt) |
| `/indicator/dualma` | POST | Dual MA calculation | Optional (ef/tdx/mqmt) |

**Unified Query DTO** (`IndicatorQueryDto`):
```typescript
{
  symbol: string;      // Stock code (e.g., '000001')
  period: string;      // Time period (1min/5min/15min/30min/60min/daily)
  startDate?: string;  // Start timestamp (optional)
  endDate?: string;    // End timestamp (optional)
  source?: 'ef' | 'tdx' | 'mqmt';  // Data source (optional)
}
```

#### Chan Theory Endpoints

| Endpoint | Method | Description | Source Parameter |
|----------|--------|-------------|------------------|
| `/chan/merge-k` | POST | K-line merging | Optional (ef/tdx/mqmt) |
| `/chan/bi` | POST | Bi recognition | Optional (ef/tdx/mqmt) |
| `/chan/fenxing` | POST | Fenxing detection | Optional (ef/tdx/mqmt) |
| `/chan/channel` | POST | Channel detection | Optional (ef/tdx/mqmt) |

**Chan Query DTO** (`ChanQueryDto`):
```typescript
{
  symbol: string;      // Stock code
  period: string;      // Time period
  startDate?: string;  // Start timestamp (optional)
  endDate?: string;    // End timestamp (optional)
  source?: 'ef' | 'tdx' | 'mqmt';  // Data source (optional)
}
```

#### Security Management API (v1)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/security/init` | POST | Initialize a new stock (simplified - no periods/source) |
| `/v1/security/add-source` | POST | Add or update data source for existing stock |
| `/v1/security/deactivate` | POST | Deactivate a stock |
| `/v1/security/activate` | POST | Activate a deactivated stock |
| `/v1/security/:code` | GET | Get stock information |

**Stock Initialization DTO** (`InitStockDto`):
```typescript
{
  code: string;       // Stock code (e.g., '000001.SH')
  name: string;       // Stock name (e.g., '平安银行')
  type: string;       // Security type ('stock', 'index', etc.)
}
```

**Add Source DTO** (`AddSourceDto`):
```typescript
{
  code: string;       // Stock code
  source: {
    type: string;     // Source type ('aktools', 'eastmoney', etc.)
    config: string;   // JSON configuration string
  };
}
```

#### Data Collector API (v1)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/collector/collect` | POST | Collect K-line data from configured sources |
| `/v1/collector/status/:code/:period` | GET | Get collection status for specific stock and period |

#### Health Check

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/app/hello` | GET | Health check |

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
