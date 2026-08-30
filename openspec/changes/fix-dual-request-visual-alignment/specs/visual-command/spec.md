# Spec Delta: visual-command（适配器与 VO 对齐）

## ADDED Requirements

### Requirement: ChanVisualAdapter Shall Enforce Index And Projection Contracts

`libs/visual-command/src/adapters/chan-visual.adapter.ts` SHALL 作为双请求架构下 `GET /v1/visual/commands` 的几何生成器，必须满足零伪造与投射一致契约。

#### Scenario: 索引映射零伪造
- **WHEN** 任意 `Bi/Duan/Channel/Zhongshu/BSP` 的 `getKIndex` 未命中
- **THEN** 适配器必须返回 `null` 并丢弃该 command，不生成 `startIndex=0`/`fromIndex=0` 的伪造几何

#### Scenario: 投射失败可观测
- **WHEN** 输入 `ChanK[]` 含不可投射的脏数据导致 `projectToChanK` 丢弃
- **THEN** 丢弃率必须可观测，且与 `Indicator` 侧的 K 透传策略一致（同以 `KPriceProjector` 严格性为准）

