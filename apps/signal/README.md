# apps/signal — 实时策略信号评估服务

`apps/signal` 是 Mist 的事件驱动型实时策略信号评估微服务，负责实时消费封存的 1m 蜡烛线并触发策略规则求值。


> 返回：[顶层 README](../../README.zh-CN.md) · [文档编写指南](../../docs/governance/documentation-guide.md)

---

## 🎯 模块职责

- **BullMQ 蜡烛事件消费**：无缝监听 `mist-backend` 封存蜡烛后分发的 BullMQ 任务队列。
- **实时策略求值**：拉取历史上下文并结合最新实时 Candle，执行技术指标与缠论买卖点策略扫描。
- **并发互斥与注册表管理**：通过 `SignalRegistryService` 与 `SignalRuntimeMutexService` 保证同一标的策略评估的串行安全与幂等。
- **产出告警事件**：评估命中时在 MySQL 中生成 `StrategyAlertEvent` 记录，并流转至通知服务。

---

## 🔌 核心接口与协议

| 接口 / 协议 | 端口 / 方法 | 说明 |
| :--- | :--- | :--- |
| `signal_registry.*` (RPC) | TCP `:9010` | 策略注册表同步与控制 RPC |
| `GET /app/hello` | HTTP `:8010` | 服务存活探针 |
| `GET /health` | HTTP `:8010` | 队列积压、消费延迟与运行时健康状态 |

---

## 📂 关键文件速查

- `src/realtime/strategy-trigger.processor.ts`：BullMQ 蜡烛封存事件消费者。
- `src/signal-registry.service.ts`：活跃策略扫描规则注册表。
- `src/signal-runtime-mutex.service.ts`：策略执行并发互斥锁。
- `src/realtime/signal-strategy-market-data.adapter.ts`：多周期策略行情数据适配器。

---

## 🛠️ 专属调试与测试

```bash
# 启动本地实时信号评估服务 (HTTP :8010 / TCP :9010)
pnpm run start:dev:signal

# 运行信号服务单元与集成测试
pnpm run test -- apps/signal
```

---

## 🔗 上下游边界

- **上游事件源**：`mist-realtime-redis`（BullMQ 队列）与 `apps/mist`。
- **下游消费方**：持久化写入 `apps/mist` 共享库数据库，并向 `apps/notification` 触发告警通知。
