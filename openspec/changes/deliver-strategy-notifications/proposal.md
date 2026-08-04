## Why

现有策略链路只能持久化 PENDING AlertEvent，并提供人工或外部消费者回写状态的 API；没有受控的
主动通知 worker。通知需要在 realtime evaluation 之后以独立故障域和独立验收交付。

## What Changes

- 将本 change 明确置于 realtime evaluation 之后延期实施；当前 artifacts 只保留已确认的所有权边界和
  待评审问题，不因为 AlertEvent 字段已经存在就提前启动 worker、渠道、schema、部署或凭据工作。
- 建立独立 notification worker，从 Mist-owned PENDING AlertEvent 边界消费待投递事件。
- 定义 channel-neutral notification envelope，并通过 adapter 对接经确认的首批入口。
- 保持策略规则和 Signal 生成归 Mist strategy runtime 所有；AstrBot/WeCom 等渠道不得执行策略。
- 将 delivery status 与 operator acknowledgement 分开。
- 不复用 `apps/schedule` 作为 notification owner。
- 首批渠道、消费方式、并发 claim、超时、失败语义、幂等、重试、dead-letter、凭据和 HIL 均为
  实施前逐项评审项；本 proposal 不预先授权新增数据库字段或严格状态机。

## Capabilities

### New Capabilities

- `strategy-notification-delivery`: 定义 PENDING AlertEvent 到外部渠道的受控投递与结果记录边界。

### Modified Capabilities

- `strategy-scheduler-alert-delivery`: 以独立 notification worker 替代 schedule/临时外部消费者的投递所有权。
- `monitoring-health-alerts`: 增加 notification consumption、channel result 和 delivery failure 观测。
- `windows-docker-appliance`: 仅在渠道和运行时评审确认后增加 notification worker 部署边界。

## Impact

- **交付顺序**：当前 change 明确延期。只有 `run-realtime-strategy-evaluation` 已稳定产生真实可消费的
  PENDING AlertEvent、相应集成证据通过且项目负责人明确恢复本 change 后，才开始现状审计和逐项评审；
  在此之前不得实现或部署 notification worker/channel adapter，也不得申请生产渠道凭据。
- **`mist`**：AlertEvent query/claim/result adapter；是否修改 schema 取决于后续明确评审。
- **`mist-skills` / 渠道集成**：只消费 Mist 事件和回写结果，不承载策略计算。
- **`mist-deploy` / `mist-monitoring`**：worker 配置、secrets、health、metrics 和真实渠道 HIL。
- **不包含**：策略规则、市场数据、K context、portfolio 或 `apps/schedule` 启用。
