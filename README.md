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

A-share quantitative core & market-data service. NestJS Monorepo spanning hardware行情 ingest (TDX/QMT), realtime 1m candle aggregation, Chan Theory engine, TA-Lib indicators, realtime strategy evaluation & alert delivery, and an isolated backtest runtime.

> 中文版见 [README.zh-CN.md](./README.zh-CN.md)。

Mist 是面向 A 股市场的核心量化计算与行情服务系统。采用 NestJS Monorepo 架构构建，集成了底层硬件行情接入（TDX/QMT）、实时 1 分钟蜡烛线聚合、纯正缠论（Chan Theory）算法引擎、TA-Lib 技术指标、实时策略求值与告警推送、以及独立的分布式回测运行时。

---

## 🌟 核心特性

- **多源实时行情接收与订阅生命周期**：严格解码 TDX / QMT 原生数据帧（schema-v2），支持声明式订阅同步、自动对账与盘前健康巡检。
- **当日 1m 蜡烛产品化（Candle Aggregator）**：基于事件驱动的高性能内存聚合与 Redis 原子封存（MULTI/EXEC），支持 A 股 242 桶交易宇宙与延迟 Grace 窗口。
- **纯正缠论算法库（ChanCore）**：严格遵循缠论原典算法——合并 K、宽笔、特征序列分段、对称无方向中枢、第一/二/三类买卖点（BSP）全量实时与回测求值。
- **完整指标计算套件**：内置 MACD、RSI、KDJ、ATR、ADX 等常用技术指标与量能剖面。
- **事件驱动策略信号引擎**：基于 BullMQ 实现蜡烛封存即刻分发，支持策略扫描注册表与并发互斥执行。
- **多渠道告警通知投递**：支持企业微信机器人、Webhook 投递与 OpenObserve 告警联动。
- **独立回测运行时（Backtest Runtime）**：将计算密集的策略与缠论回测剥离为独立微服务，支持 TCP RPC 调用与资源准入控制。
- **收盘权威数据同步**：收盘后自动从数据源拉取权威 K 线覆盖入库，确保历史数据纯净。

---

## 🏛️ Monorepo 架构与服务拓扑

```text
mist (NestJS Monorepo)
├── apps/
│   ├── mist/                      # 主业务 API 与 Ingress 接收端 (HTTP :8001)
│   ├── chan/                      # 缠论计算独立 API (HTTP :8008)
│   ├── signal/                    # 实时策略信号评估引擎 (HTTP :8010, TCP RPC :9010)
│   ├── backtest/                  # 隔离回测计算运行时 (HTTP :8004, TCP RPC :8005)
│   ├── notification/              # 告警与消息通知服务 (HTTP :8006)
│   ├── schedule/                  # 定时任务与收盘权威数据同步 (HTTP :8003)
│   └── realtime-subscription-hil/ # 实时订阅硬件在环 (HIL) 验证工具
└── libs/
    ├── chancore/                  # 缠论核心纯算法库（分型/笔/段/中枢/买卖点）
    ├── indicators/                # 技术指标计算库 (TA-Lib)
    ├── realtime/                  # 实时行情接收、聚合器、Redis 存储与时钟抽象
    ├── strategy/                  # 策略定义、条件语法解析与执行框架
    ├── signal/                    # 实时信号调度与注册表客户端
    ├── backtest/                  # 回测领域模型与 RPC 客户端
    ├── shared-data/               # TypeORM 实体定义与数据库 Repository
    ├── timezone/                  # 上海时区 (Asia/Shanghai) 交易时段计算
    ├── transport/                 # TCP RPC 传输契约与编解码
    └── decimal/ / constants/      # 精度计算与全局常量
```

---

## 📋 环境与依赖要求

- **Node.js**：`>= 24.0.0`
- **包管理器**：`pnpm` (`pnpm install --frozen-lockfile`)
- **MySQL**：`>= 8.0`（生产与开发均通过 migration 管理）
- **Redis**：`>= 7.0`（用于实时蜡烛封存与 BullMQ 任务队列）

---

## 🚀 快速上手

### 1. 安装依赖

```bash
pnpm install
```

### 2. 环境配置与数据库迁移

复制并配置环境变量文件：
```bash
cp .env.example .env
```

执行单向递增数据库迁移（禁止使用 `synchronize: true`）：
```bash
pnpm run db:migrate
```

### 3. 启动开发服务

```bash
# 启动主后端 API 服务 (端口: 8001)
pnpm run start:dev:mist

# 启动缠论 API 服务 (端口: 8008)
pnpm run start:dev:chan

# 启动实时信号评估服务 (端口: 8010)
pnpm run start:dev:signal

# 启动隔离回测服务 (端口: 8004)
pnpm run start:dev:backtest
```

访问常用服务入口：
- 主后端 Swagger 文档：`http://127.0.0.1:8001/api-docs`
- 主后端健康探针：`http://127.0.0.1:8001/app/hello`
- 缠论服务探针：`http://127.0.0.1:8008/app/hello`

---

## 🧪 测试与质量门禁

为避免本地时区影响 A 股交易日边界计算，CI 与本地集成测试统一在 `TZ=UTC` 下运行：

```bash
# 运行单元与集成测试 (TZ=UTC 门禁)
env TZ=UTC pnpm run test:ci

# 代码格式与类型检查
pnpm run lint
pnpm run typecheck

# 跨服务与契约校验
pnpm run ci:contracts

# 生产镜像构建检查
pnpm run build:docker

# OpenSpec 规范一致性校验
openspec validate --all --strict
```

---

## 🚢 生产部署拓扑

生产环境部署由 `mist-deploy` 统一编排，服务通过 Docker Compose 运行于 Windows 宿主环境：

```text
Docker Appliance 容器网格
  ├── mysql:3306                 # 关系型数据库
  ├── mist-realtime-redis:6379   # 实时 Candle 缓存与 BullMQ
  ├── mist-backend:8001          # 主 API 与行情 Ingress
  ├── chan-api:8008              # 缠论计算 API
  ├── signal:8010 (RPC :9010)    # 实时策略评估
  ├── backtest:8004 (RPC :8005)  # 隔离回测运行时
  ├── notification:8006          # 消息通知网关
  ├── mist-schedule:8003         # 定时采集与收盘同步
  ├── mist-fe:3000               # 前端应用
  ├── web-gateway:80             # Nginx 反向代理
  └── openobserve:5080           # OTLP 统一日志/指标平台
```

生产网关入口：
- 前端页面：`/`、`/k`、`/strategies`
- 业务后端：`/api/mist/*`
- 缠论接口：`/api/chan/*`

---

## 📚 目录与文档入口

- **子应用说明书**：
  - [主业务 API (apps/mist)](./apps/mist/README.md)
  - [缠论 API (apps/chan)](./apps/chan/README.md)
  - [实时信号引擎 (apps/signal)](./apps/signal/README.md)
  - [隔离回测运行时 (apps/backtest)](./apps/backtest/README.md)
  - [通知服务 (apps/notification)](./apps/notification/README.md)
  - [收盘同步与定时任务 (apps/schedule)](./apps/schedule/README.md)
  - [实时订阅 HIL 工具 (apps/realtime-subscription-hil)](./apps/realtime-subscription-hil/README.md)
- **核心算法与库说明**：
  - [缠论算法核心库 (libs/chancore)](./libs/chancore/README.md)
  - [技术指标库 (libs/indicators)](./libs/indicators/README.md)
  - [实时行情与聚合库 (libs/realtime)](./libs/realtime/README.md)
- **工程治理规范**：
  - [Mist 规范中心与开发手册](./docs/governance/README.md)
  - [项目质量常驻治理指南](./docs/project-quality-governance-guide.md)
  - [契约与数据治理指南](./docs/governance/contract-and-data-governance-guide.md)

---

## 📄 许可证

本项目遵循 [BSD-3-Clause](https://opensource.org/licenses/BSD-3-Clause) 开源许可证。
