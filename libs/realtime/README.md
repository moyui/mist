# libs/realtime — 实时行情与 Redis 存储契约库

`libs/realtime` 定义了实时行情处理中的核心契约、Redis 存储结构模式及连接层配置。

---

## 🎯 模块职责

- **Redis Key 规范契约**：严格定义当日 1m 蜡烛线在 Redis 中的 4 类核心 Key 结构（`closed` 已封存、`watermark` 水位线、`manifest` 清单、`due` 超时待封存队列）。
- **数据保留与隔离策略**：规范 72 小时保留期（TTL）与独立 Key Prefix 隔离，防止实时行情数据污染或被误清除。
- **连接配置抽象**：提供可靠的有界重试与禁止离线排队的 Redis 客户端配置。

---

## 🔌 核心导出品与 Key 格式

```typescript
import {
  buildClosedCandleKey,
  buildCandleManifestKey,
  buildCandleDueKey,
  buildCandleWatermarkKey,
} from '@app/realtime';

// Redis Key 构造示例:
// mist:candle:1m:closed:600519.SH:2026-08-25
// mist:candle:1m:manifest:2026-08-25
```

---

## 📂 关键文件速查

- `src/realtime-candle-redis.contract.ts`：Redis Key 构造器、TTL 常量与契约定义。
- `src/redis-connection.config.ts`：Redis 连接配置工厂。

---

## 🛠️ 专属测试

```bash
pnpm run test -- libs/realtime
```

---

## 🔗 上下游边界

- **消费方**：`apps/mist`（蜡烛产品化写入）、`apps/signal`（BullMQ 触发消费与回测）。
