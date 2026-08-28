# libs/shared-data — 数据库持久化实体与共享模型库

`libs/shared-data` 集中定义了 Mist 系统的 TypeORM 数据库实体、共享枚举及数据传输映射器（Mappers）。


> 返回：[顶层 README](../../README.zh-CN.md) · [文档编写指南](../../docs/governance/documentation-guide.md)

---

## 🎯 模块职责

- **数据库实体定义**：统一维护证券标的、K 线历史、策略定义、信号记录、告警事件、订阅分配等核心 MySQL 表的 TypeORM 实体。
- **共享枚举与值对象**：定义交易周期（`Period`）、订单与告警状态（`AlertStatus`）、买卖点类型等。
- **数据转换与 Mappers**：提供 Entity 与前端 VO / 领域模型之间的纯函数转换。

---

## 🔌 核心实体列表

- `Security`：证券基础信息与活跃状态。
- `KLineDay` / `KLineMin`：历史日线与分钟 K 线。
- `StrategyDefinition` / `StrategyVersion`：策略定义与版本快照。
- `StrategySignal`：策略评估产出的信号。
- `StrategyAlertEvent`：需要投递给用户的告警事件。
- `SubscriptionAssignment`：实时行情订阅分配。

---

## 📂 关键文件速查

- `src/entities/`：TypeORM 实体类定义。
- `src/enums/`：全局领域枚举。
- `src/mappers/`：DTO 与 Entity 映射工具。

---

## 🛠️ 专属测试

```bash
pnpm run test -- libs/shared-data
```

---

## 🔗 上下游边界

- **共享方**：供 `apps/mist`、`apps/schedule`、`apps/signal`、`apps/backtest`、`apps/notification` 共同引入与注入 TypeORM Repository。
