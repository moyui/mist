# libs/signal — 实时策略信号契约与 RPC 客户端库

`libs/signal` 提供了实时策略信号相关的共享契约定义、注册表数据结构、以及与 `apps/signal` 通信的 TCP RPC 客户端封装。


> 返回：[顶层 README](../../README.zh-CN.md) · [文档编写指南](../../docs/governance/documentation-guide.md)

---

## 🎯 模块职责

- **信号领域契约**：严格定义实时策略触发事件、扫描上下文与注册表状态模型。
- **Signal Registry RPC 客户端**：为主后端 `apps/mist` 提供调用 `apps/signal` 注册、注销和同步策略扫描规则的强类型客户端。

---

## 🔌 核心导出品与 API

```typescript
import { SignalRegistryClient, SignalRegistryAction } from '@app/signal';

// 同步策略注册表到 apps/signal
await signalRegistryClient.syncStrategyAssignments(assignments);
```

---

## 📂 关键文件速查

- `src/contracts/`：实时信号与注册表数据契约。
- `src/runtime/`：TCP RPC 通信与客户端调用封装。

---

## 🛠️ 专属测试

```bash
pnpm run test -- libs/signal
```

---

## 🔗 上下游边界

- **调用端**：`apps/mist`。
- **服务端**：`apps/signal`（TCP `:9010`）。
