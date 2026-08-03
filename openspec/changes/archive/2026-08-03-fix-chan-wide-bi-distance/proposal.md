## Why

Chan 宽笔校验当前用两根 K 的 MySQL 自增主键差值推断中间原始 K 数量。`k.id` 是跨股票、来源和
周期共享的持久化身份，不是单个有序 K 序列中的连续位置；其他数据插入或自增缺口会把相邻 K
误判为相距很多根，进而错误放行候选笔。

该漏洞会直接改变 Bi Phase A/Phase B 的输入，应在 `extract-chan-core` 固定 differential baseline
之前独立修复，避免把错误行为固化进新核心库。

## What Changes

- 宽笔“两个极值 K 之间至少有 3 根原始 K”改为按本次有序原始 K 输入中的位置计算。
- MySQL `k.id`、`middleOriginId`、`originIds`、Channel `startId/endId` 继续只表示持久化身份，不再
  被解释为序列距离。
- 位置映射仅存在于单次算法调用内部，不加入 HTTP、DTO/VO、数据库或公共 K contract，也不生成
  冒充数据库 ID 的 ordinal。
- 增加 gapped/interleaved ID 回归测试，证明相同有序价格/时间序列不因主键间距不同而改变宽笔结果。
- 保留 `/v1/chan/*`、Bi 两阶段响应、现有枚举及持久化边界；不夹带 ChanCore 抽取或其他算法修订。

## Capabilities

### New Capabilities

- `chan-bi-width-validation`: 定义宽笔原始 K 距离按有序输入位置计算、数据库 ID 仅作身份的契约。

### Modified Capabilities

<!-- None. Existing Phase A/Phase B requirements remain unchanged. -->

## Impact

- **代码**：`apps/mist/src/chan/services/bi.service.ts` 的宽笔校验及必要的调用参数。
- **测试**：`apps/mist/src/chan/services/bi.service.spec.ts` 增加连续、gapped、interleaved identity 场景。
- **行为**：修复依赖主键差值产生的假宽笔；真实有序 K 间距相同的输入得到相同判断。
- **不影响**：HTTP schema、TypeORM schema/migration、Redis、部署、Indicator/Strategy、Chan persistence。
- **依赖关系**：本 change 完成后，`extract-chan-core` 应以修复后的算法作为 characterization baseline。
