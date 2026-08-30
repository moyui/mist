# 段绘制错误专项问题文档 — 2026-08-30

> 状态：只读分析，不改代码。供第二方 AI 复核。
> 生产库 + 本地代码双源核实。

## 1. 背景与范围

- 回测正主：`backtest_runs.id IN (22,23)` = 同一内容
  - `id=22: 5m / qmt / 000001 / 2026-05-30~2026-08-28 / chan_bsp / completed`
  - `id=23: 5m / qmt / 000001 / 2026-01-01~2026-08-28 / chan_bsp / completed`
  - `id=25` 为 30m 对照，已排除（用户纠正）
- K 表：`k.security_id=5 (000001 上证指数) period=5 source=qmt` 共 2832 根，`2026-06-01 09:35 ~ 2026-08-21 15:00`
- 缠论版本：`ChanCore.algorithmVersion = 4`（`chan-core.ts:27`，dist 全量校验 `AlgorithmVersion=4`）
- K 时区：容器 `mist-mysql TZ=Asia/Shanghai`，DB `timestamp` 按上海时区存储与查询
- 查库方式：`ssh mist-box "docker exec mist-mysql mysql -umist -pchange-me-app -N -e ..."` 只读

## 2. 锚点现象（用户指定，上海时区）

### 锚点 A — 2026-06-23 10:40 附近应为最高点，段跨过去了

5m K（qmt）：

```
2026-06-23 09:35 4169.86/4148.86
2026-06-23 09:40 4168.80/4159.71
2026-06-23 09:45 4165.84/4156.05
2026-06-23 09:50 4159.27/4144.94
2026-06-23 09:55 4167.22/4144.05
2026-06-23 10:00 4166.91/4162.03
2026-06-23 10:05 4171.77/4162.11
2026-06-23 10:10 4168.85/4160.60
2026-06-23 10:15 4163.11/4156.81
2026-06-23 10:20 4161.18/4156.10
2026-06-23 10:25 4167.10/4159.91
2026-06-23 10:30 4174.25/4166.70
2026-06-23 10:35 4174.87/4169.37
2026-06-23 10:40 4175.35/4171.28  <- 序列内最高 high=4175.35
2026-06-23 10:45 4173.38/4166.75
2026-06-23 10:50 4173.00/4167.51
2026-06-23 10:55 4169.01/4162.64
2026-06-23 11:00 4169.25/4159.70
2026-06-23 11:05 4161.98/4155.09
...
2026-06-23 11:30 4147.55/4138.42
```

形态：09:35~10:40 逐级冲高至 4175.35，10:45 起回落。`10:40` 应为顶分型中枢，段应在此截断，实际段跨过。

### 锚点 B — 2026-07-10 13:15 附近明显错段

5m K（qmt）：

```
2026-07-10 09:35 4032.64/4027.13
2026-07-10 09:40 4046.65/4027.93
2026-07-10 09:45 4050.81/4044.40
2026-07-10 09:50 4053.50/4045.26
2026-07-10 09:55 4059.07/4051.37
2026-07-10 10:00 4059.48/4052.47
...
2026-07-10 11:25 4067.96/4062.49
2026-07-10 11:30 4067.07/4059.41
2026-07-10 13:05 4068.95/4061.68
2026-07-10 13:10 4070.23/4059.15
2026-07-10 13:15 4074.83/4070.09  <- 序列内最高
2026-07-10 13:20 4073.59/4067.67
2026-07-10 13:25 4069.98/4065.55
2026-07-10 13:30 4067.37/4062.13
2026-07-10 13:35 4065.05/4057.24
2026-07-10 13:40 4057.92/4043.82  急跌
2026-07-10 13:45 4047.07/4040.37
...
2026-07-10 15:00 3999.47/3995.81
```

同为冲高顶 + 次笔急跌，段同样跨过 13:15。

> 共同点：冲高顶 + 次根急跌 + 首尾特征区间有缺口。其它时段正常，说明非系统性起点偏移，是**有缺口的第二种情况**未确认。

## 3. 精确代码位置

文件：`libs/chancore/src/internal/duan.ts`

```
 6-22  段算法总述（67课特征序列法 + 71课再分辨）
 37-67  findValidSegmentStart — 4笔有效结构起点选择
 70-99  segment — 段切分主循环
110-152 findSegmentEnd — 边界分型判定（核心）
154-194 case2Confirmed — 第二种情况倒推确认
196-212 isDirectionalFenxing — 顶/底分型谓词
213-244 mergeFeatureInclusion — 特征序列包含合并
246-249 hasGap — 缺口判定
251-288 buildDuan — 段构建
```

下游放大链：`duan.ts` 跨顶 → `duan-range.ts` 高低错 → `duan-channel.ts` 段中枢 `zg=min(high)/zd=max(low)` 与全量交集延伸错 → `central-expansion.ts` 扩张误判 → `buy-sell-point.ts` / `divergence.ts` 以错 `zg/zd` 为基准 → 现象层“中枢过大/重叠、买多卖少”。

## 4. 当前实现精确逻辑

### 4.1 findSegmentEnd 第二种情况

```ts
// duan.ts:126-144
if (prev !== null) {
  const first = stdSeq.length > 0 ? stdSeq[stdSeq.length - 1] : null;
  if (first !== null && this.isDirectionalFenxing(first, prev, rev, direction)) {
    const endIdx = prev.biIndex - 1;
    if (endIdx >= segStartIdx) {
      if (!this.hasGap(first, prev)) {
        return { endIdx, nextStart: prev.biIndex }; // case-1 无缺口直接确认
      }
      const extremum = direction === TrendDirection.Down ? prev.low : prev.high;
      if (this.case2Confirmed(bis, prev.biIndex, direction, extremum)) {
        return { endIdx, nextStart: prev.biIndex }; // case-2 有缺口需倒推
      }
    }
  }
  stdSeq = this.mergeFeatureInclusion(stdSeq, prev, direction);
}
prev = rev;
```

- 特征元素定义（71课）：`first` = 转折前最后一个特征元素（`stdSeq` 末元素，含包含合并）；`second` = `prev`（原始）；`third` = `rev`（原始）；`first/second` 间不做包含合并。
- 分型谓词 `isDirectionalFenxing:201-211`：Up 看顶 `second.high > first.high && second.high > third.high`；Down 看底 `second.low < first.low && second.low < third.low`。
- 缺口 `hasGap:247-249`：`a.high < b.low || b.high < a.low`。

### 4.2 case2Confirmed 口径过严（用户追问点）

```ts
// duan.ts:159-194
private case2Confirmed(bis, reverseStart, originalDir, extremum): boolean {
  const reverseDir = bis[reverseStart].trend;
  let stdSeq: FeatureElement[] = [];
  let prev: FeatureElement | null = null;
  for (let i = reverseStart; i < bis.length; i++) {
    const bi = bis[i];
    if (originalDir === TrendDirection.Up && bi.high > extremum) return false; // 刺破即失效
    if (originalDir === TrendDirection.Down && bi.low < extremum) return false;
    if (bi.trend === reverseDir) continue;
    const rev = { high: bi.high, low: bi.low, biIndex: i };
    if (prev !== null) {
      const first = stdSeq.length > 0 ? stdSeq[stdSeq.length - 1] : null;
      if (first !== null && this.isDirectionalFenxing(first, prev, rev, reverseDir)) {
        return true; // 反向任意分型即确认
      }
      stdSeq = this.mergeFeatureInclusion(stdSeq, prev, reverseDir);
    }
    prev = rev;
  }
  return false;
}
```

过严两处：
1. 需反向再成型才确认：反向特征序列需凑出 `first/second/third` 三元组分型才 `return true`。若反向样本不足或被 `mergeFeatureInclusion` 压缩后判不出分型，则永远 `return false`，原段挂起。
2. 刺破即失效：`bi.high > extremum` / `bi.low < extremum` 无容差，且检查的是**所有** `bi`（含同向段体笔），5m 指数一根刺破即失效。

两锚点均落 `hasGap==true` 分支，进入此函数后反向确认迟迟不成立，导致该断不断。

### 4.3 mergeFeatureInclusion 压缩（用户追问点）

```ts
// duan.ts:217-244
private mergeFeatureInclusion(seq, next, direction): FeatureElement[] {
  if (seq.length === 0) return [next];
  const last = seq[seq.length - 1];
  const lastContainsNext = last.high >= next.high && last.low <= next.low;
  const nextContainsLast = next.high >= last.high && next.low <= last.low;
  if (!lastContainsNext && !nextContainsLast) return [...seq, next];
  const merged: FeatureElement =
    direction === TrendDirection.Up
      ? { high: Math.max(last.high, next.high), low: Math.max(last.low, next.low), biIndex: next.biIndex }
      : { high: Math.min(last.high, next.high), low: Math.min(last.low, next.low), biIndex: next.biIndex };
  return [...seq.slice(0, -1), merged];
}
```

压缩后果：
- 序列长度变短，`first` 的 `high/low` 被抬高/压低，本应作为 `first` 的极值被包容区间覆盖，导致 `second.high > first.high` 判假；
- 反向确认阶段凑不出三元组，前述 `case2Confirmed` 永不触发；
- `biIndex` 覆盖为 `next.biIndex`，丢失原始极值对应笔的身份追溯。

## 5. 对照缠论原文（67/68/71课）的疑问

> GitHub 拉取受限（`tomcat123a/chanlun` 404，API 400），以下按本仓注释引用的 67/71 课原文口径与常见开源实现对照，待第二方 AI 以原文复核。

| 规则 | 原文口径（本仓注释） | 现实现状 | 存疑点 |
|------|---------------------|----------|--------|
| 特征序列包含 | 67课：特征序列需做包含处理；71课：第一/第二元素之间不做包含（跨转折不属同序列） | `findSegmentEnd` 中 `stdSeq` 含合并，`first/second` 间确实不合并（`stdSeq` 不含 `prev`，`prev` 单独传入）— 符合 | — |
| 包含合并方向 | — | Up 取 `max high/max low`，Down 取 `min high/min low` — 与 `KMergeCalculator` 同口径 | 需核 71 课对 Up/Down 包含的取法是否确为 `max/max` 与 `min/min`，还是 `max/min` 取极值包络 |
| 分型判定 | 71课边界分型：第一/第二/第三元素按上述定义 | `isDirectionalFenxing` 严格 `>` / `<`，无等号 — 符合 | — |
| 缺口定义 | 67课两种情况以有无缺口区分 | `hasGap = a.high < b.low || b.high < a.low` 严格不重叠 — 符合 | — |
| 第二种情况确认 | 67课：有缺口需“下一段的特征序列出现分型”才倒推确认；期间新高/新低则不成立 | `case2Confirmed` 要求反向任意分型即确认 + 刺破 `extremum` 即失效 — 文字符合，但**实现上对“下一段”的起点与“刺破”的检查范围是否过宽存疑**：`reverseStart = prev.biIndex` 是否应为 `prev.biIndex + 1` 的下一段起点？`extremum` 检查是否应对反向特征序列之外、或对同向段体笔豁免？ | 待原文复核：1) reverseStart 取值 2) 失效检查是否仅对反向特征元素而非所有 Bi |
| 段终止位置 | 段终止于 `second` 的前一根同向笔 | `endIdx = prev.biIndex - 1` — 符合 | — |

## 6. 影响与复现建议

- 锚点 A/B 同属“有缺口顶分型 + 反向确认不足”路径，其它时段走 `case-1` 直接确认故正常。
- 复现步骤（只读）：以同一份 `5m/qmt/000001` K 经 `mapKToStrategyBar → KPriceProjector → ChanCore.createBi → createDuan` 导出 `Bi/Duan` 端点与 `FeatureElement` 日志，打印 `first/second/third` 与 `hasGap/case2Confirmed` 命中与失效分支。
- 修复方向（不落地，仅供复核）：收敛 `case2Confirmed` 的 `reverseStart` 与 `extremum` 检查范围，或对 `mergeFeatureInclusion` 的压缩做最小改动；`algorithmVersion 4→5` + `chan-full-output.characterization` 快照同步；段回归后复测段中枢/买卖点是否自愈，避免对中枢/BSP 做无效改动。

## 7. 原始证据（生产库）

```sql
-- 22/23 元数据
SELECT id,period,source,DATE_FORMAT(start_date,'%Y-%m-%d %H:%i:%s'),DATE_FORMAT(end_date,'%Y-%m-%d %H:%i:%s'),kind,status FROM mist.backtest_runs WHERE id IN (22,23);
-- 22 5 qmt 2026-05-30 00:10:15 2026-08-28 00:10:15 chan_bsp completed
-- 23 5 qmt 2026-01-01 09:30:00 2026-08-28 15:00:00 chan_bsp completed

-- K 统计
SELECT COUNT(*) FROM mist.k WHERE security_id=5 AND period=5 AND source='qmt'; -- 2832
```

链路文件：`libs/chancore/src/internal/duan.ts:110-249`，`libs/chancore/src/internal/duan.spec.ts`，`libs/visual-command/src/adapters/chan-visual.adapter.ts` 前端落点对照。

---

## 8. 复查结论（2026-08-30 第二方 AI 实证，只读复现）

> 状态：✅ **已修复**（2026-08-31，`add-duan-first-bi-break-rule` change）
> 修复落地：`findSegmentEnd` `first===null` 分支新增缠论 71 课「第一笔破坏」判据；判据确认的
> 段恒为单笔并作为 71 课显式特例合法输出（keep）；`ChanCore.algorithmVersion` 4→5；新增 duan 层
> characterization（锚点窗口 fixture + SHA 锁定）。全量验证：chancore 178/178、25→33 段、
> 8 处判据命中（含本锚点）、判据作废场景零副作用。
> 原文出处勘误：`tomcat123a/-chanlun`（原文档写成 `tomcat123a/chanlun`，404）；108 课原文本地
> 副本在 `chanlun-original/`（64=65 课、67、71 课课号有一课偏移，以标题为准）。

> 复现方式：生产库全量 2832 根 K（`/tmp/k_full.csv`）→ `ChanCore.createBi`（158 笔）→
> `duan.ts` 逐行复刻的 Decoy 诊断版 `createDuan`（插桩 `[FX]/[MERGE]/[CASE2]/[SEG]` 日志），
> 与原版 25/25 段端点 PARITY 一致（插桩不改变行为）。全部结论有日志实证。

### 8.1 段划分现状（实证）

| 段 | 笔区间 | 起止（上海） | 段内最高 | 说明 |
|----|--------|--------------|---------|------|
| #5 | bi#38..42 | 06-22 10:35 → 06-25 11:20 | **4175.35**（bi#38 终点 = 06-23 10:40 顶） | 段终点极值 4133.1，**顶被跨过** ← 锚点 A |
| #11 | bi#66..74 | 07-09 11:25 → 07-15 10:05 | **4074.83**（bi#66 终点 = 07-10 13:15 顶） | 段终点极值 3981.67，**顶被跨过** ← 锚点 B |

25 段中仅这 2 段跨极值（`/tmp/duan-repro/stat.ts`），其余 23 段正常。

### 8.2 根因（代码级，锚点 A 为例，B 完全同构）

`findSegmentEnd` 的 `stdSeq` **从段起点重置为空**。锚点 A 的 Up 段起于 bi#38
（06-22 10:35 起涨），段内**第一根反向笔 bi#39 的起点恰是 10:40 顶**（bi#38 终点 = bi#39 起点 = 4175.35）：

1. `i=41`（第二根反向笔 bi#41 到来）时 `stdSeq` 仍为空 → `first === null`，71 课三元组
   判定的 `if (first !== null && isDirectionalFenxing(...))` 被整体跳过 —— **10:40 顶作为
   第二元素的分型检查从未执行**（`[FX]` 日志中该处无任何记录）；
2. 随后 `stdSeq = mergeFeatureInclusion([], bi#39, Up)` 把**转折笔 bi#39 连同其极值
   4175.35 并入 stdSeq 成为第一元素**；
3. 此后所有候选第二元素（bi#41=4113.19、bi#43=4133.1、bi#45=4068.4…）的顶分型判定
   `second.high > first.high` 全部被 4175.35 压制 → `isFx=false`（`[FX]` 日志实证
   `first=bi#39(4175.35) prev=bi#41 rev=bi#43 isFx=false`）；
4. 段被迫延伸，直到 06-25 11:20 的次高顶 4133.1 处三元组 (bi#41, bi#43, bi#45) 成立且
   `gap=false` → **case1 直接确认**，段结束于 bi#42 —— 段因此跨过 10:40 顶。

锚点 B 同构：bi#67（07-10 13:15 顶起）作为段内首反向笔被并入 stdSeq，4074.83 压制后续
判定至 07-15 顶 3981.67（(bi#73, bi#75, bi#77) 成立，case1）。

### 8.3 原文档诊断勘误

| 原诊断 | 复查结果 |
|--------|---------|
| §4.2「两锚点均落 `hasGap==true` 分支，case2Confirmed 过严致该断不断」 | **证伪**。两锚点最终确认均为 `gap=false` 的 case1，`hasGap`/`case2Confirmed` 分支从未进入（日志无 [CASE2] 记录） |
| §4.2 过严①「reverseStart 应为 prev.biIndex+1」 | 不相关（case2 未触发）；语义上也不成立——prev 是转折笔，作为反向新段段体首笔正确 |
| §4.2 过严②「刺破即失效、检查所有 bi 无容差」 | 不相关；且锚点后续笔均未越过 extremum，该分支不会触发 |
| §4.3「mergeFeatureInclusion 压缩致 first 极值被覆盖、分型判假」 | **非根因**。锚点特征元素为交叉区间（互不包含），走 push 分支；`[MERGE]` 日志唯一压缩发生在无关处（bi#62/bi#64） |
| §5「isDirectionalFenxing 严格 >/< 符合」 | 成立（但根因不在判假，在判定被跳过） |
| §5「包含合并方向 Up=max/max、Down=min/min」 | 正确，缠论标准口径，非 max/min 包络，存疑可删除 |
| §6「修复方向：收敛 case2Confirmed 的 reverseStart/extremum」 | **方向错误**，按此修复锚点不会自愈 |

### 8.4 修复方向候选（未落地，待用户拍板 → OpenSpec）

共同根因：**`stdSeq` 丢失段起点之前的特征元素 + `first===null` 时判定跳过 +
转折笔并入 stdSeq 后以段极值压制后续判定**（三者是同一缺口的连锁）。真语义（67/71 课）：
第一元素 = 转折点**前**最后一个特征元素，不限于段内。

- **候选 1（推荐）**：段起点有效结构校验推广——`nextStart` 处复用 `findValidSegmentStart`
  的 4 笔有效结构检查。锚点 A：bi#38 不满足有效 Up 起点（`bi#38.high=4175.35 ≥ bi#40.high=4113.19`）
  → 跳过 → bi#39 满足有效 Dn 起点（`bi#39.low=4085.59 > bi#41.low=4075.49 && bi#39.high > bi#40.high`）
  → 段从 **10:40 顶起为 Dn 段**，顶成为段边界，现象自愈。锚点 B 同理（bi#67 有效 Dn 起点）。
  ⚠️ 语义副作用：bi#38 成为**孤儿笔**（不被任何段包含）——与首段 check_init_seg 丢弃笔的既有语义一致，但段间产生孤儿是新增行为，需确认。
- **候选 2**：`stdSeq` 跨段延续初始化（首元素 = 段起点前最后一根特征元素，锚点 A 为 bi#37）。
  (bi#37, bi#39, bi#41) 顶分型成立 → case1 → 段终止于 bi#38 —— **单笔段**，违反"段至少 3 笔"，
  须再处理单笔段合法性，复杂且不标准。
- **候选 3**：维持现状延伸语义 + `first===null` 时不并入 stdSeq —— 不解决现象（10:40 顶仍无
  法确认，段仍延伸至次高顶），排除。

影响面：候选 1 改动段起点推进逻辑 → 后续段端点连锁变化 → 段中枢（`duan-channel`）
zg/zd 与买卖点基准全部受影响 → 必须 `algorithmVersion 4→5` + characterization 快照更新
+ 段/中枢/BSP 全链回归。按三步工作流：先写 OpenSpec spec（候选 1 语义 + 孤儿笔归属 +
version bump + 锚点 K 固化为 fixture），逐条确认后再实施。

### 8.5 遗留（实测数据，供 spec 引用）

- 158 笔全量端点、锚点段内 `[FX]/[MERGE]` 日志：`/tmp/duan-repro/`（repro.ts / duan-debug.ts / stat.ts / k_full.csv）
- `duan.spec.ts` 现有 case2 用例仅覆盖"反向元素不足"，无"首反向笔即转折笔"场景 → 修复后需补
- 修复候选 1 需先在 Decoy 上做**预演**（改 findSegmentEnd 起点校验，对比段端点变化），再定稿 spec

---
*复查：2026-08-30 | 作者：Reasonix agent（第二方） | 证据：生产库 2832 根 K + Decoy 插桩日志（PARITY 25/25）*
