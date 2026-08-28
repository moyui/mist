# apps/realtime-subscription-hil — 实时订阅硬件在环 (HIL) 验证工具

`apps/realtime-subscription-hil` 是行情订阅生命周期的硬件在环（Hardware-in-the-Loop）CLI 验证工具，用于在实机交易环境中验证 TDX 与 QMT 数据源的订阅控制协议。


> 返回：[顶层 README](../../README.zh-CN.md) · [文档编写指南](../../docs/governance/documentation-guide.md)

---

## 🎯 模块职责

- **硬件在环协议验证**：在真实的 Windows 桌面环境与交易时段内，直连数据源控制接口，驱动 `syncSubscriptions` / `subscribe` / `unsubscribe` / `getSubscriptions` 完整链路。
- **协议快照与证据捕获**：采集原始 schema-v2 数据帧并生成校验哈希，为发布提供确定性证据。
- **双源 Soak 稳定性测试**：长时间并发采样 TDX + QMT 数据流的新鲜度与 Journal 指纹。

---

## 🔌 执行模式与环境变量

| Profile 模式 | 环境变量配置 | 说明 |
| :--- | :--- | :--- |
| **单源验证/捕获** (默认) | `MIST_HIL_PROFILE=single-source` | 驱动单源全生命周期订阅并捕获快照 |
| **双源 Soak 压测** | `MIST_HIL_PROFILE=dual-source-soak` | TDX + QMT 双源长期稳定性采样 |

---

## 📂 关键文件速查

- `src/main.ts`：HIL CLI 执行入口（非长驻服务，运行结束即退出）。
- `apps/mist/src/realtime/hil/realtime-subscription-hil.ts`：HIL 核心执行逻辑与校验断言。

---

## 🛠️ 专属执行命令

```bash
# 编译 HIL 工具
pnpm build:hil

# 执行订阅 HIL 验证
pnpm hil:realtime-subscriptions
```

---

## 🔗 边界说明

- **工具定位**：仅用于协议与数据源控制面验证，不替代后端 `RealtimeSubscriptionLifecycleCoordinator` 的日常声明式调度。
