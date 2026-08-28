# apps/mist — 主业务 API 与行情 Ingress 服务

`apps/mist` 是 Mist 的主后端应用，承担用户侧 REST API、证券基础信息管理、数据源实时快照接收（Ingress）、1m 蜡烛线产品化汇聚接入、以及订阅生命周期管理。


> 返回：[顶层 README](../../README.zh-CN.md) · [文档编写指南](../../docs/governance/documentation-guide.md)

---

## 🎯 模块职责

- **数据源 Ingress 接收**：通过 WebSocket 接收 TDX/QMT 实时原生数据帧并转换为规范快照 `CanonicalRealtimeSnapshot`。
- **蜡烛产品化接入**：将实时快照写入 `OpenCandleAggregator`，实现 1m 蜡烛聚合与 Redis 原子落盘。
- **订阅生命周期管理**：以数据库中 `ACTIVE` 证券状态为唯一权威目标，协调数据源订阅、09:15 盘前对账与重启恢复。
- **业务 API 提供**：提供历史 K 线、技术指标查询、缠论计算代理、策略管理与告警查询。

---

## 🔌 核心接口与路由

| 路由路径 | 方法 | 说明 |
| :--- | :--- | :--- |
| `GET /app/hello` | GET | 服务健康检查探针 |
| `GET /v1/securities` | GET | 证券代码列表与订阅状态查询 |
| `POST /v1/indicators/k` | POST | 历史与当日拼接 K 线查询 |
| `POST /v1/indicators/{macd\|rsi\|kdj}` | POST | 技术指标计算 |
| `POST /v1/chan/{merge-k\|bi\|fenxing\|channel}` | POST | 缠论基础图表元素计算 |
| `/v1/strategy-{definitions\|signals\|alert-events}` | ALL | 策略定义、信号列表与告警事件管理 |
| `/v1/subscription/assignments` | ALL | 实时行情订阅分配管理 |

---

## 📂 关键文件速查

- `src/realtime/realtime-snapshot-ingress.service.ts`：实时行情快照 Ingress 接收端点。
- `src/realtime/realtime-subscription-lifecycle.coordinator.ts`：订阅生命周期与对账协调器。
- `src/realtime/candle/realtime-market-data-product.service.ts`：1m 蜡烛产品化汇聚入口。
- `src/strategy/controllers/`：策略定义、信号与告警控制器。

---

## 🛠️ 专属调试与测试

```bash
# 启动本地开发服务 (默认端口 8001)
pnpm run start:dev:mist

# 运行主应用单元与集成测试
pnpm run test -- apps/mist
```

---

## 🔗 上下游边界

- **上游**：通过 WebSocket 连接 `mist-datasource`（TDX :9001 / QMT :9002）。
- **下游**：持久化写入 MySQL 数据库，将封存蜡烛通过 BullMQ 队列推入 `apps/signal` 触发策略扫描。
