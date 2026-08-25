# apps/backtest — 独立回测运行时服务

`apps/backtest` 是 Mist 的计算隔离型回测运行时微服务，将计算密集的策略回测与缠论买卖点（BSP）历史模拟从主后端解耦，保障实时业务的低延迟。

---

## 🎯 模块职责

- **计算隔离回测**：独立执行单股票/多周期在指定历史时间区间的策略信号匹配与缠论买卖点回测。
- **并发与资源准入控制**：通过 `BacktestAdmissionService` 实现有界并发与排队准入，防止回测压垮系统与数据库连接池。
- **高性能 TCP RPC 通信**：基于 NestJS Microservices TCP 传输契约，提供毫秒级 RPC 调度响应。

---

## 🔌 核心接口与协议

| 接口 / 协议 | 端口 / 方法 | 说明 |
| :--- | :--- | :--- |
| `backtest.run` (RPC) | TCP `:8005` | 提交并执行回测任务（包含策略回测与 Chan BSP 回测） |
| `GET /app/hello` | HTTP `:8004` | 基础健康探针 |
| `GET /health` | HTTP `:8004` | 包含准入队列状态与资源水位的深度健康指标 |

---

## 📂 关键文件速查

- `src/backtest-run.executor.ts`：回测执行器（数据加载、指标计算、信号匹配与结果组装）。
- `src/backtest-admission.service.ts`：并发控制、排队与限流准入服务。
- `src/backtest-market-data.adapter.ts`：历史 K 线数据抽取与量能归一化适配器。
- `src/main.ts`：HTTP 与 TCP 微服务双入口 Bootstrap。

---

## 🛠️ 专属调试与测试

```bash
# 启动本地独立回测服务 (HTTP :8004 / TCP :8005)
pnpm run start:dev:backtest

# 运行回测服务单元与集成测试
pnpm run test -- apps/backtest
```

---

## 🔗 上下游边界

- **上游调用方**：`apps/mist`（通过 `libs/backtest` RPC 客户端发起回测请求）。
- **底层依赖**：`libs/chancore`（缠论算法）、`libs/strategy`（策略语法解析）、`libs/shared-data`（MySQL 历史 K 线）。
