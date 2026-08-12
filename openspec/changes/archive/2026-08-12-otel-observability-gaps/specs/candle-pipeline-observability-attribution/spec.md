---
name: candle-pipeline-observability-attribution
version: 0.1.0
---

# Candle Pipeline Observability Attribution

## ADDED Requirements

### Requirement: R1: 计数 source 归因
skip/discard 计数指标 SHALL 携带 `source` label（tdx|qmt），支持按源归因；
reason 枚举 SHALL 保持有界。

#### Scenario: 两源同时 skip 时可归因
- Given 交易时段 TDX 与 QMT 都有午休/异常帧被 skip
- When 查询 `mist_candle_skip_total` 按 source 分组
- Then 每组 SHALL 只含单一 source 的计数，可区分 TDX/QMT 各自贡献

### Requirement: R2: finalize span 判定结果
`candle.due.finalize` span SHALL 携带判定结果 attribute：`verdict`（sealed/discarded）、
discarded 时 `discardReason`、vwap 校验结果（通过/失败）。

#### Scenario: 桶被 discard 时判定可见
- Given 一个 due 桶因 no_snapshot 被 discard
- When 查询该 finalize span
- Then `verdict` SHALL 为 discarded 且 `discardReason` 可见

### Requirement: R3: snapshot span 关键判断点
`candle.snapshot.process` span SHALL 携带 `bucketStartMs` 与 skip 时的 `skippedReason`
attribute（reason 有界），关键判断点（ingest gated/skip/accept）SHALL 可经 attribute 查询，
不依赖 span events 索引。

#### Scenario: skip 原因经 attribute 可查
- Given 一个帧因 out_of_session 被 skip
- When 在 OO 按 attribute 过滤查询 snapshot span
- Then `skippedReason` SHALL 等于 out_of_session 且 `bucketStartMs` 可见

### Requirement: R4: 事件保留
关键判断点提升为 attribute 后，原 span events SHALL 保留（细节不删，attribute 为查询主路径）。

#### Scenario: 提升后细节不丢失
- Given attribute 提升已上线
- When 检查 span
- Then events 仍包含原判断点细节，与 attribute 不冲突
