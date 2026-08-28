# apps/notification — 告警与消息通知服务

`apps/notification` 是 Mist 的统一告警通知分发微服务，负责将策略信号事件与系统运行告警可靠投递至企业微信、Webhook 及外部平台。


> 返回：[顶层 README](../../README.zh-CN.md) · [文档编写指南](../../docs/governance/documentation-guide.md)

---

## 🎯 模块职责

- **策略告警投递**：拉取并消费 `StrategyAlertEvent`，渲染 Markdown/Text 消息模板并分发。
- **多渠道通道支持**：内置企业微信群机器人（WeCom Bot）、通用 HTTP Webhook 通道。
- **OpenObserve 告警集成**：接收 OpenObserve 监控告警 Webhook 并转发路由。
- **投递可靠性与重试**：实现有界重试、状态回写（DELIVERED / FAILED）与幂等防重。

---

## 🔌 核心接口与路由

| 路由路径 | 方法 | 说明 |
| :--- | :--- | :--- |
| `GET /app/hello` | GET | 服务基础存活探针 |
| `GET /health` | GET | 通道连通性与投递状态检查 |
| `POST /v1/alerts/oo-webhook` | POST | 接收 OpenObserve 告警通知 Webhook |
| `POST /v1/notifications/dispatch` | POST | 手动触发或重试通知投递 |

---

## 📂 关键文件速查

- `src/channels/wecom/wecom.channel.ts`：企业微信机器人通道实现。
- `src/delivery/notification-delivery.service.ts`：通知投递调度与重试状态机。
- `src/oo-alert/oo-alert.service.ts`：OpenObserve 监控告警接收与解析。

---

## 🛠️ 专属调试与测试

```bash
# 启动本地通知微服务 (默认端口 8006)
pnpm run start:dev:notification

# 运行通知服务单元测试
pnpm run test -- apps/notification
```

---

## 🔗 上下游边界

- **上游事件源**：`apps/signal`（策略告警）与 `apps/schedule`（盘前巡检报告）。
- **外部通道**：企业微信开放平台 Webhook、自定义 Webhook 端点。
