# mist-skills Design Document

**Date:** 2026-04-13
**Status:** Approved
**Scope:** Create independent `mist-skills` repository implementing Anthropic Agent Skills for AstrBot integration

## Background

The mist monorepo already provides an MCP server (port 8009) with 21 tools. We need a parallel integration path using Anthropic Agent Skills to connect with AstrBot (v4.13.0+), an IM chatbot platform that supports Skills natively.

Skills will call the mist backend's existing REST API (port 8001) to provide stock market analysis capabilities. This avoids duplicating business logic and keeps Skills as a thin orchestration layer.

## Scope

### In Scope (12 MCP tools with REST endpoints)

| MCP Tool | REST Endpoint | Skill |
|----------|---------------|-------|
| merge_k | `POST /chan/merge-k` | chan-theory |
| create_bi | `POST /chan/bi` | chan-theory |
| get_fenxing | `POST /chan/fenxing` | chan-theory |
| analyze_chan_theory | `POST /chan/channel` | chan-theory |
| macd | `POST /indicator/macd` | technical-indicators |
| kdj | `POST /indicator/kdj` | technical-indicators |
| rsi | `POST /indicator/rsi` | technical-indicators |
| get_index_info | `GET /security/v1/:code` | data-query |
| get_kline_data | `POST /indicator/k` | data-query |
| get_daily_kline | `POST /indicator/k` (period=daily) | data-query |
| list_indices | `GET /security/v1/all` | data-query |
| get_latest_data | DB-only, no REST | data-query |

### Out of Scope (9 tools — internal/PoC, no REST endpoints)

- `get_segments`, `get_combined_analysis`, `get_kline_with_indicators` — no REST endpoint
- `collect_data` — collector endpoint exists but excluded per user decision
- `schedule_collection`, `list_schedules`, `enable_schedule`, `disable_schedule`, `get_schedule_status` — schedule controller has only cron jobs, no HTTP endpoints

## Architecture

### Approach: 3 Skills Grouped by MCP Service Category

Chosen over 1-monolithic-skill and 12-individual-scripts approaches. Rationale:

- Granular enough for tiered loading (agent only loads relevant Skill)
- Cohesive grouping by domain (chan theory, indicators, data query)
- Each Skill stays under 500-line SKILL.md limit
- Follows official spec directory structure

### Repository Structure

```
mist-skills/
├── skills/
│   ├── chan-theory/
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       ├── merge_k.py
│   │       ├── create_bi.py
│   │       ├── get_fenxing.py
│   │       └── analyze_chan.py
│   ├── technical-indicators/
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       ├── macd.py
│   │       ├── kdj.py
│   │       └── rsi.py
│   └── data-query/
│       ├── SKILL.md
│       └── scripts/
│           ├── list_indices.py
│           ├── get_index_info.py
│           ├── get_kline_data.py
│           └── get_daily_kline.py
├── shared/
│   ├── __init__.py
│   ├── config.py
│   └── mist_client.py
└── README.md
```

### Shared Module

**`shared/config.py`** — Configuration:
- `MIST_API_BASE_URL` (default `http://127.0.0.1:8001`)
- Request timeout and retry settings
- Environment variable loading

**`shared/mist_client.py`** — HTTP client wrapper:
- Python `requests` or `httpx` based
- Handles mist unified response format: `{success, code, message, data, timestamp, requestId}`
- Raises exceptions on `success: false` with business error message
- Centralized error handling for network failures, timeouts

### Skill Design

#### chan-theory

**Purpose:** Chan Theory (缠论) analysis — merge K-lines, identify strokes (笔), fractals (分型), and channels.

**SKILL.md guidance:**
- Explain the analysis pipeline: merge-k → bi → fenxing → channel
- Describe parameters: `code`, `period`, `startDate`, `endDate`, `source`
- Advise agent on when to use each step vs. the combined `analyze_chan.py`

**Scripts:**

| Script | REST Endpoint | Description |
|--------|---------------|-------------|
| `merge_k.py` | `POST /chan/merge-k` | Merge raw K-lines into processed K-lines |
| `create_bi.py` | `POST /chan/bi` | Generate strokes (笔) from merged K-lines |
| `get_fenxing.py` | `POST /chan/fenxing` | Identify fractals (分型) |
| `analyze_chan.py` | `POST /chan/channel` | Full analysis: merge → bi → fenxing → channel |

**Parameter mapping:** All scripts accept `IndicatorQueryDto`-compatible arguments: `{code, period, startDate, endDate, source}`.

#### technical-indicators

**Purpose:** Technical indicator calculations — MACD, KDJ, RSI.

**SKILL.md guidance:**
- Help agent choose the right indicator for the analysis goal
- MACD: trend-following, momentum
- KDJ: overbought/oversold, short-term reversals
- RSI: relative strength, divergence detection

**Scripts:**

| Script | REST Endpoint | Description |
|--------|---------------|-------------|
| `macd.py` | `POST /indicator/macd` | MACD calculation (fast=12, slow=26, signal=9) |
| `kdj.py` | `POST /indicator/kdj` | KDJ stochastic (period=14, k=3, d=3) |
| `rsi.py` | `POST /indicator/rsi` | RSI calculation (period=14) |

**Parameter mapping:** All scripts accept `IndicatorQueryDto`-compatible arguments: `{code, period, startDate, endDate, source}`.

#### data-query

**Purpose:** Discovery and retrieval of market data — list securities, query K-line data.

**SKILL.md guidance:**
- Instruct agent to call `list_indices` first for symbol discovery
- Explain period values: 1min, 5min, 15min, 30min, 60min, daily
- Explain source values: ef (East Money), tdx (TongDaXin), mqmt (MaQiMaTe)

**Scripts:**

| Script | REST Endpoint | Description |
|--------|---------------|-------------|
| `list_indices.py` | `GET /security/v1/all` | List all available securities |
| `get_index_info.py` | `GET /security/v1/:code` | Get details for a specific security |
| `get_kline_data.py` | `POST /indicator/k` | Query intraday K-line data |
| `get_daily_kline.py` | `POST /indicator/k` (period=daily) | Query daily K-line data |

**Note:** `get_kline_data` and `get_daily_kline` map to the same REST endpoint, differentiated by the `period` parameter.

## Technical Decisions

1. **Language:** Python scripts in `scripts/` — AstrBot runtime is Python-based, Skills scripts execute in the agent's local environment
2. **HTTP client:** `requests` library (synchronous, widely available in Python environments)
3. **Error handling:** Shared `mist_client.py` parses mist's unified response format and raises descriptive exceptions
4. **Configuration:** Environment variables with sensible defaults, no hardcoded URLs

## Constraints

- Official Skills spec: `name` max 64 chars (lowercase + hyphens), must match directory name
- SKILL.md description max 1024 chars in frontmatter
- SKILL.md body recommended under 500 lines
- Scripts must be self-contained (import from `shared/` via relative or sys.path)
