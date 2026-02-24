# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Mist** is a stock market analysis and alert system built with NestJS. It combines traditional technical analysis with AI-powered intelligent agents to provide trading insights and alerts for the Shanghai Stock Exchange (上证指数).

**Architecture**: Monorepo with multiple applications and shared libraries using pnpm workspaces.

## Development Commands

```bash
# Install dependencies
pnpm install

# Development - run specific app in watch mode
pnpm run start:dev:mist    # Main stock analysis (port 8001)
pnpm run start:dev:saya    # AI Agent system (port 8002)
pnpm run start:dev:chan    # Notification module

# Build all projects
pnpm run build

# Linting and formatting
pnpm run lint
pnpm run format

# Testing
pnpm run test              # Unit tests
pnpm run test:e2e          # End-to-end tests
pnpm run test:cov          # Test coverage
pnpm run test:watch        # Watch mode
```

## Architecture

### Applications (`apps/`)

| App | Purpose | Port |
|-----|---------|------|
| **mist** | Main stock analysis application - data collection, indicators, trend analysis | 8001 |
| **saya** | AI Agent system using LangChain/LangGraph for intelligent analysis | 8002 |
| **schedule** | Scheduled task runner for periodic data collection | 8003 |
| **chan** | Notification/communication module | - |

### Libraries (`libs/`)

| Library | Purpose |
|---------|---------|
| **prompts** | AI agent prompt templates for different agent roles |
| **config** | Configuration management |
| **utils** | Shared utilities |
| **timezone** | Time zone handling (uses date-fns-tz) |
| **shared-data** | Data models and entities for stock indices |

### AI Agent System (saya)

The AI system uses a multi-agent architecture with specialized roles:

1. **Commander** - Receives user commands, plans tasks, coordinates agents
2. **DataEngineer** - Data acquisition, processing, calculation, vector storage
3. **Strategist** - Applies predefined strategy rules, outputs buy/sell signals
4. **PatternFinder** - Historical pattern matching and probability analysis
5. **SentimentAnalyst** - News/social media sentiment analysis
6. **Reporter** - Generates reports and alerts
7. **RiskMonitor** - Market and portfolio risk monitoring

See `Roadmap.md` for the detailed agent workflow diagram.

## Data Pipeline

### Data Source
- **AKTools** (https://aktools.akfamily.xyz) - Local Python FastAPI server for stock data

### Python Environment Setup
```bash
# Create venv
python3 -m venv python-env

# Activate
source python-env/bin/activate

# Install AKTools
python3 -m pip install aktools

# Start server
python3 -m aktools
```

### Database
- **MySQL** with TypeORM
- Database creation: `CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;`

### Time Periods
Data is stored for multiple timeframes: 1min, 5min, 15min, 30min, 60min, daily

## Technical Analysis

- **Library**: node-talib (164 supported functions - see `Talib.md`)
- **Implemented Indicators**: KDJ, MACD, RSI
- **Chart Analysis**: Chan Theory (缠论) module for pattern recognition

## Path Mappings

```typescript
@app/prompts     → libs/prompts/src
@app/config      → libs/config/src
@app/utils       → libs/utils/src
@app/timezone    → libs/timezone/src
@app/shared-data → libs/shared-data/src
```

## Key Dependencies

- **@nestjs/schedule** - Cron jobs for scheduled tasks
- **@langchain/langgraph** - AI agent orchestration
- **@langchain/deepseek** - DeepSeek LLM integration
- **talib** - Technical analysis library
- **date-fns-tz** - Timezone handling
- **typeorm** - MySQL ORM

## Known Issues

- AKTools does not warn when port is occupied, causing silent failures
- Timezone configuration requires proper setup in date-fns-tz

## License

BSD-3-Clause
