---
## ADDED Requirements

### Requirement: Realtime subscription stall alerts are source-aware

告警规则 SHALL 区分数据源（tdx / qmt）检测订阅数据流动停滞：既有
snapshot 断流规则（A1）MUST NOT 因另一源正常流动而掩盖本源的单独断流
（count 聚合需按 source 拆分或 label 过滤）；新增订阅 stall 规则
（`mist_datasource_subscription_stall_active ≥ 1`，datasource 侧状态机
检出：活动窗口内静默超 grace 进入 PUSHING，连续恢复失败升级 escalated）
MUST 按 source label 区分。活动窗口（`MIST_ACTIVITY_WINDOWS`，默认
`09:15-11:30,13:00-15:00` UTC+8）是 datasource 状态机与告警时段的单一
边界：窗口外 datasource 已 IDLE（stall_active 恒 0），规则在收盘/午休/夜间
自然无样本，无需 receiver 另做时段推断（datasource 窗口即告警时段）。

#### Scenario: 单源断流不被掩盖

- **WHEN** QMT 侧静默断流而 TDX 正常流动（同 stream 名 count 聚合）
- **THEN** 告警规则 MUST 按 source 维度检出 QMT 断流（拆分规则或
      label 过滤）
- **AND** TDX 的正常流动 MUST NOT 抑制 QMT 的告警

#### Scenario: stall 检出触发告警

- **WHEN** datasource 导出 `mist_datasource_subscription_stall_active{source}`
      值为 1（PUSHING 态：活动窗口内静默超 grace，连续恢复失败升级 escalated）
- **THEN** 告警规则 MUST 触发 P1 告警并投递
- **AND** 规则评估 MUST 尊重时间窗口（不采用 value 谓词绕过窗口的写法）

#### Scenario: 窗口外不误报

- **WHEN** 处于活动窗口外（午休/收盘/夜间）
- **THEN** datasource MUST 为 IDLE（stall_active 恒 0），规则评估 MUST 无
      样本而不触发
- **AND** 无需 receiver 增加单独的时段判定（窗口是单一边界，双源一致）
