# Proposal: instrument-backend-candle-pipeline

## Why

O2a（instrument-datasource-bridge-ingest）补齐了**数据链路前半段**（bridge → datasource）：
现在能回答"数据有没有进 datasource"。但**后半段**（datasource → backend WS → ingress →
aggregator → finalizer → Redis）仍完全不可见——这正是 2026-08-07 TDX 断流 56 分钟的
核心盲区：当时只知道 datasource 侧正常（帧进了），backend sealed 停滞，但**不知道帧在
backend 内部哪个判断点被丢弃**。

审计确认（2026-08-09）backend 链路的判断点**零日志、零 span**（计数器在增但无消费者）：
- WS client：5 个拒绝分支（transportReady/decode/symbol/allowlist/converter）
- ingress：trading-day rollover（静默清 cache）、product 抛错吞掉（仅 log）
- product：early gate 静默、queue overflow、startup-boundary 静默
- aggregator：**6 个 skip reason 只计 2 个**、opened/updated/rolled-over/invalidated 无计数
- registerDueIfFirst：too-late 静默
- due scanner：malformed member 静默
- finalizer：seal 有效/无效分支、discardDue 两个 reason

本 change 用 OTel span + 日志 + 指标补齐**数据链路后半段**，与 O2a 形成完整可观测链路：
```
bridge → datasource（O2a ✓）→ backend WS → ingress → aggregator → finalizer → Redis（O1）
```

## What Changes

### 1. 两类根 span（每帧 + 每 due member）

- **`candle.snapshot.process`**（每帧）：覆盖 WS client → ingress → product → aggregator →
  registerDueIfFirst 全程。判断点（skip/invalidated/overflow）→ span event + status
- **`candle.due.finalize`**（每 due member）：覆盖 processDueMember → finalizer.seal/
  discardDue。判断点（already sealed/hard horizon/valid/discard reason）→ span event + status

### 2. 生命周期日志 + 拒绝 warn

- 3 个 info 点：帧进入（symbol/source/capturedAt）、聚合完成（outcome）、finalize 完成（sealed/discarded）
- 判断点拒绝：warn（reason + symbol/bucket），带 trace_id（复用 O2a 的 TraceContextFormatter）

### 3. 静默丢弃点修复（加 span event + warn 日志）

- ingress 的 product 抛错吞掉（L54-62）
- registerDueIfFirst too-late（L342-347）
- startup-boundary skip（L219-225）
- handleSnapshot early gate（L180-181）
- no-client return（L213-214, L429-430）
- malformed due member（L468-478）
- isAlreadySealed 失败吞掉（L860-861）

### 4. 指标（决策点，见 design D3）

backend 已有 counters（sealedTotal/discardTotals 等）但无消费者——O1 选择是否导出为
OTel metrics（candle 链路健康度），范围待确认。

## Scope

### In scope
- mist 仓（backend app）：span + 日志 + 指标（若确认）
- mock 验证：注入 → OpenObserve 见 candle.snapshot.process / candle.due.finalize span

### Out of scope
- WS trace context 跨进程传播（datasource → backend 串联）→ 后续 change
- datasource 侧（O2a 已完成）
- 告警规则（OpenObserve 告警后续 change）
