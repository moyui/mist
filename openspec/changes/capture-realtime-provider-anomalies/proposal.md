## Why

TDX 与 QMT 的部分失败语义只有在真实 terminal/runtime 异常发生时才能得到可信
证据。为了验收而在生产 bridge、datasource 或 Mist 中加入故障钩子，会扩大运行
边界并可能让人为结果被误记成 provider 行为，因此需要一套独立、非阻塞、事后
触发的异常捕获与复盘契约。

## What Changes

- 新增双 provider 真实异常观察流程，只在运行时自然出现异常后启动证据采集。
- 固定 TDX snapshot 网络失败、退订未收敛、退订状态不可验证，以及 QMT native
  unsubscribe/journal/lease/callback 异常的分类与最小证据。
- 明确禁止为了命中异常分支而在 production bridge、wire、datasource route、
  Mist client 或 operator tooling 中加入 fault injection。
- 使用脱敏 JSON/Markdown incident bundle 保存时间窗、artifact identity、当前
  owner/build、typed result、native-list 或 journal 边界、恢复动作和最终状态。
- 真实异常没有发生时保持 `not-observed`，不阻塞当前正常路径发布，也不得用
  deterministic unit test 冒充真实 terminal evidence。

## Capabilities

### New Capabilities

- `realtime-provider-anomaly-capture`: 定义 TDX/QMT 真实异常发生后的只读捕获、
  脱敏归档、恢复边界和复盘结论。

### Modified Capabilities

无。

## Impact

- 主要影响 `mist-deploy` 的运维手册、只读采集脚本和 evidence manifest。
- 可能读取 `mist-datasource` datasource health、bridge health、QMT journal
  摘要与 bounded logs，以及 Mist typed-client/monitoring 已有结果。
- 不改变 TDX/QMT bridge artifact、subscription wire、production API、业务
  数据库、Redis、策略、告警或正常订阅生命周期。
