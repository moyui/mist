---
## MODIFIED Requirements

### Requirement: Realtime subscription convergence is not data-flow evidence

订阅收敛（datasource 四态收敛 / controller registry 一致）SHALL 视为
"订阅命令已应用"的状态证据，MUST NOT 视为"行情数据在流动"的投递证据；
收敛后数据的持续流动 SHALL 由独立活动信号（快照接收 / 回调进展）观测，
静默场景由状态驱动的轮询重发与 stall 检测补充
（realtime-subscription-restart-recovery R1/R2）。

#### Scenario: 收敛但回调静默

- **WHEN** 桥/终端重启后 datasource 显示收敛（desired/converged 一致）
      但终端回调实际丢失（callback_count 归零、无快照）
- **THEN** 收敛状态 MUST NOT 抑制轮询重发（PUSHING 态下发全量 subscribe）
- **AND** stall 检测 MUST 以活动信号（快照/回调）为判定依据，不以收敛
      状态为投递证据

#### Scenario: 推送验证后稳定态语义不变

- **WHEN** datasource 观察到快照流动（推送成功），状态切 VERIFIED
- **THEN** poll 返回 diff（现有增量语义），桥零动作
- **AND** 状态机重发 MUST 为叠加动作，不改变 poll diff / result 四态
      收敛的正常路径语义
