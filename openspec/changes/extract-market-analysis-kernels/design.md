## Context

`IndicatorService` 同时包含技术指标计算和 TypeORM K 查询；Chan controller 通过该 service 取数，
Chan providers 本身则执行派生计算。`apps/chan` 直接导入 `apps/mist/src/chan/chan.module` 及其
interceptor/filter，导致 app 边界名义独立、代码所有权仍耦合。

## Goals / Non-Goals

**Goals:**

- 提供无 I/O、确定性、可直接单测的 Indicator/Chan kernels。
- 让现有 API adapter 与 strategy runtime 的 Indicator 计算复用完全相同的算法。
- 保持当前算法、响应和无持久化行为。

**Non-Goals:**

- 不修订 Chan 算法定义、不新增买卖点、不写 Chan 表。
- 不迁移公共 URL、不拆仓库、不引入远程 analysis service。
- 不设计策略 field catalog；只提供稳定的 kernel outputs。
- 不把 Chan 接入 V1 strategy hot path；`chan.*` 的窗口、字段和语义必须由后续独立 change 评审。

## Decisions

### 1. Pure kernel 与 data adapter 分离

kernel 输入为已经验证并排序的有限 K/number arrays，输出为确定性 value objects。Security 查找、
source 选择、日期解析、TypeORM 和 HTTP envelope 归 adapter 所有。

kernel 不选择策略计算窗口，也不保留跨调用 indicator state。共享策略 field catalog 决定每个字段的
精确 `calculationBarCount`，strategy adapter 只把该有界有序数组传入 kernel：当前批准
KDJ(9,3,3) 为 13 根、MACD(12,26,9) 为 130 根；crossover 的 current/prior 由调用方提供两个相邻窗口。
现有 HTTP adapter 继续按既有请求准备输入，本 change 不把策略窗口反向变成公共 Indicator API 参数。
尤其当前 KDJ HTTP controller 实际传入 `period=14`，而 V1 strategy catalog 明确使用 KDJ(9,3,3)；
行为保持式抽取必须分别固定两种调用，不得借机把 HTTP 改成 9 或把 strategy 改成 14。

MACD kernel 不保存或恢复 EMA checkpoint，不读取窗口以前的历史，也不通过 `nextValue` 累积进程状态。
相同的精确输入与算法版本必须在重启、backtest 和 realtime 中得到相同输出。窗口选择属于策略契约，
数值计算属于 pure kernel；两边不得互相复制职责。

### 2. Indicator 与 Chan 在同一 analysis 边界下保持独立子模块

允许建立一个 `market-analysis` library，但 IndicatorCore 与 ChanCore 使用独立 exports，避免
策略或 Chan 被迫加载无关依赖。

### 3. 先做行为保持式抽取

现有 tests/fixtures 作为 characterization baseline。任何算法修复必须另建 change；本 change 的
新旧 adapter 对同一输入必须产生相同输出。

### 4. 不通过 HTTP 供 strategy worker 计算

strategy worker 只直接调用所需的 Indicator pure exports。独立 `chan-api` 只作为外部 HTTP adapter，
ChanCore 不成为 V1 strategy 计算依赖。

## Risks / Trade-offs

- [抽取时意外改变数值或 Phase B 顺序] → 先固定 fixtures、fingerprint 和 differential tests。
- [DTO/Entity 泄漏进 pure library] → 建立 library-owned input/output types，在 adapter 显式转换。
- [两个 Chan 路由继续重复] → 本 change 记录 owner 问题，但任何公共路由移除另行评审。

## Migration Plan

1. 评审 library 目录、public exports、input/output 和 error contract。
2. 建立 characterization tests。
3. 抽取 IndicatorCore，再重接现有 adapter。
4. 抽取 ChanCore，再重接 `apps/mist` 与 `apps/chan`。
5. 运行现有 API/Chan 全量回归和 build。
6. 如有行为差异，回滚 adapter wiring；不保留双算法实现。

## Open Questions

- 使用一个 `libs/market-analysis` 还是两个独立 Nest libraries。
- Chan 公共路由长期由 `mist-backend`、`chan-api` 或兼容迁移期双入口中的哪一种持有。
- pure kernel 对 invalid finite input 使用 typed result 还是抛出 domain error。
