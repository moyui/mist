<p align="right">
  <a href="./README.zh-CN.md">中文</a> | <strong>English</strong>
</p>

# Mist — A-share Quantitative Core System

<p align="left">
  <img src="https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen.svg" alt="Node Version" />
  <img src="https://img.shields.io/badge/pnpm-%5E9.0.0-blue.svg" alt="pnpm" />
  <img src="https://img.shields.io/badge/NestJS-v10-red.svg" alt="NestJS" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-BSD--3--Clause-green.svg" alt="License" />
</p>

A-share quantitative core & market-data service. NestJS Monorepo spanning hardware market-data ingest (TDX/QMT), realtime 1m candle aggregation, Chan Theory engine, TA-Lib indicators, realtime strategy evaluation & alert delivery, and an isolated backtest runtime.

> See [README.zh-CN.md](./README.zh-CN.md) for Chinese.

---

## 🌟 Core Features

- **Multi-source realtime market-data ingest & subscription lifecycle**: strict schema-v2 decoding of TDX/QMT native frames, declarative subscription sync, auto-reconciliation and pre-market health checks.
- **Intraday 1m Candle Productization (Candle Aggregator)**: event-driven in-memory aggregation with Redis atomic sealing (MULTI/EXEC), covering the 242-bucket A-share trading universe with a late-data grace window.
- **Authentic Chan Theory engine (ChanCore)**: faithful to the original Chan Theory — merged K, wide Bi, feature-sequence Duan, symmetric directionless Zhongshu, and full realtime + backtest evaluation of BSP types 1/2/3.
- **Full indicator suite**: MACD, RSI, KDJ, ATR, ADX and volume profile out of the box.
- **Event-driven strategy signal engine**: BullMQ-based instant dispatch on sealed candles, with a strategy scan registry and concurrent mutex execution.
- **Multi-channel alert delivery**: WeCom bot, generic Webhook, and OpenObserve alert integration.
- **Isolated backtest runtime**: compute-intensive strategy & Chan backtests run as a separate microservice via TCP RPC with admission control.
- **Post-close authoritative sync**: pulls authoritative K-lines from datasources after market close to overwrite intraday data, ensuring historical purity.

---

## 🏛️ Monorepo Architecture & Service Topology

```text
mist (NestJS Monorepo)
├── apps/
│   ├── mist/                      # Main business API & Ingress (HTTP :8001)
│   ├── chan/                      # Chan Theory compute API (HTTP :8008)
│   ├── signal/                    # Realtime strategy evaluation (HTTP :8010, TCP RPC :9010)
│   ├── backtest/                  # Isolated backtest runtime (HTTP :8004, TCP RPC :8005)
│   ├── notification/              # Alert & notification service (HTTP :8006)
│   ├── schedule/                  # Scheduled jobs & post-close authoritative sync (HTTP :8003)
│   └── realtime-subscription-hil/ # Realtime subscription HIL verification tool
└── libs/
    ├── chancore/                  # Chan Theory core library (fractal / Bi / Duan / Zhongshu / BSP)
    ├── indicators/                # Technical indicator library (TA-Lib)
    ├── realtime/                  # Realtime ingest, aggregator, Redis & clock abstractions
    ├── strategy/                  # Strategy definitions, condition DSL & execution framework
    ├── signal/                    # Realtime signal dispatch & registry client
    ├── backtest/                  # Backtest domain models & RPC client
    ├── shared-data/               # TypeORM entities & repositories
    ├── timezone/                  # Asia/Shanghai trading session calculations
    ├── transport/                 # TCP RPC transport contracts & codecs
    └── decimal/ / constants/      # Precise arithmetic & global constants
```

---

## 📋 Requirements

- **Node.js**: `>= 24.0.0`
- **Package manager**: `pnpm` (`pnpm install --frozen-lockfile`)
- **MySQL**: `>= 8.0` (managed via migrations)
- **Redis**: `>= 7.0` (realtime candle sealing & BullMQ queues)

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment & run migrations

Copy and configure the env file:

```bash
cp .env.example .env
```

Run forward-only DB migrations (`synchronize: true` is forbidden):

```bash
pnpm run db:migrate
```

### 3. Start dev services

```bash
# Main backend API (:8001)
pnpm run start:dev:mist

# Chan Theory API (:8008)
pnpm run start:dev:chan

# Realtime signal evaluation (:8010)
pnpm run start:dev:signal

# Isolated backtest service (:8004)
pnpm run start:dev:backtest
```

Common service endpoints:
- Main backend Swagger: `http://127.0.0.1:8001/api-docs`
- Main backend health: `http://127.0.0.1:8001/app/hello`
- Chan service health: `http://127.0.0.1:8008/app/hello`

---

## 🧪 Testing & Quality Gates

To avoid local timezone drift on A-share trading-day boundaries, CI and integration tests run under `TZ=UTC`:

```bash
# Unit & integration tests (TZ=UTC gate)
env TZ=UTC pnpm run test:ci

# Lint & typecheck
pnpm run lint
pnpm run typecheck

# Cross-service & contract checks
pnpm run ci:contracts

# Production image build check
pnpm run build:docker

# OpenSpec spec consistency
openspec validate --all --strict
```

---

## 🚢 Production Deployment Topology

Deployed via `mist-deploy` (Docker Compose on a Windows host):

```text
Docker Appliance container mesh
  ├── mysql:3306                 # Relational DB
  ├── mist-realtime-redis:6379   # Realtime Candle cache & BullMQ
  ├── mist-backend:8001          # Main API & market-data Ingress
  ├── chan-api:8008              # Chan Theory compute API
  ├── signal:8010 (RPC :9010)    # Realtime strategy evaluation
  ├── backtest:8004 (RPC :8005)  # Isolated backtest runtime
  ├── notification:8006          # Notification gateway
  ├── mist-schedule:8003         # Scheduled collection & post-close sync
  ├── mist-fe:3000               # Frontend app
  ├── web-gateway:80             # Nginx reverse proxy
  └── openobserve:5080           # OTLP unified logs/metrics platform
```

Production gateway:
- Frontend: `/`, `/k`, `/strategies`
- Business backend: `/api/mist/*`
- Chan API: `/api/chan/*`

---

## 📚 Directory & Documentation

- **Sub-apps**:
  - [Main business API (apps/mist)](./apps/mist/README.md)
  - [Chan API (apps/chan)](./apps/chan/README.md)
  - [Realtime signal engine (apps/signal)](./apps/signal/README.md)
  - [Isolated backtest runtime (apps/backtest)](./apps/backtest/README.md)
  - [Notification service (apps/notification)](./apps/notification/README.md)
  - [Post-close sync & scheduled jobs (apps/schedule)](./apps/schedule/README.md)
  - [Realtime subscription HIL tool (apps/realtime-subscription-hil)](./apps/realtime-subscription-hil/README.md)
- **Core libs**:
  - [Chan Theory core (libs/chancore)](./libs/chancore/README.md)
  - [Indicator library (libs/indicators)](./libs/indicators/README.md)
  - [Realtime & aggregation (libs/realtime)](./libs/realtime/README.md)
- **Engineering governance**:
  - [Mist governance hub & handbook](./docs/governance/README.md)
  - [Project quality governance guide](./docs/project-quality-governance-guide.md)
  - [Contract & data governance guide](./docs/governance/contract-and-data-governance-guide.md)

---

## 📄 License

Licensed under [BSD-3-Clause](https://opensource.org/licenses/BSD-3-Clause).
