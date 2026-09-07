# Design: Pre-Market Strategy Window Hydration and Timeline Governance

## 1. 架构全景与时序流转

### 1.1 盘前时间轴编排（09:05 ~ 09:30）

```mermaid
sequenceDiagram
    autonumber
    participant Sch as apps/schedule (Cron)
    participant Coord as apps/mist (Subscription Lifecycle)
    participant Sig as apps/signal (Signal Runtime)
    participant DB as MySQL (Historical K)
    participant DS as TDX/QMT Bridge

    Note over Sch,DS: 09:05 盘前主动体检
    Sch->>Sig: 健康探针 /health
    Sch->>DS: 数据源通道健康探测
    Sch-->>WeChat: 推送 09:05 盘前体检简报

    Note over Sch,DS: 09:15 订阅生命周期 Read-Before-Reset
    Coord->>DB: 读取 ACTIVE 标的分配 (desired)
    Coord->>DS: syncSubscriptions(desired) 下发订阅
    Coord->>DS: getSubscriptions() 回读确认
    Coord->>Sig: SignalRegistry RPC 通知 (可选更新)

    Note over Sch,DS: 09:20 盘前策略滑窗预热屏障 (Pre-market Hydration)
    Sig->>Sig: 触发 09:20 预热 (或事件触发)
    loop 每个活跃 (securityId, source, period)
        Sig->>DB: loadRealtimeWindow(昨日收盘锚点, requiredBars)
        DB-->>Sig: 返回历史 K 线列表
        Sig->>Sig: imputer.hydrate() 载入 SharedStrategyWindowStore
    end
    Sig->>Sig: 标记预热完成 (isPrewarmed=true)

    Note over Sch,DS: 09:25 ~ 09:30 早盘竞价与开盘连续交易
    DS->>Sig: 09:31 首根 1m candle_finalized 任务到达
    Sig->>Sig: prepare() 发现内存已就绪 -> 纯内存 append
    Sig->>Sig: 5~10ms 内完成缠论求值与买卖点扫描 (零 DB I/O)
```

---

## 2. 核心设计细节

### 2.1 集中调度常量收口 (`@app/timezone`)

在 `libs/timezone/src/cron-schedules.constants.ts` 补充 09:20 盘前预热调度定义：

```typescript
/** 09:20 Asia/Shanghai on exchange trading days (Monday - Friday). Pre-market strategy window hydration barrier. */
export const CRON_PRE_MARKET_STRATEGY_WARMUP_0920 = '0 20 9 * * 1-5';
```

### 2.2 `SharedStrategyWindowStore` 主动预热扩展

在 [`SharedStrategyWindowStore`](file:///Users/moyui/sean/mist/mist/libs/signal/src/runtime/shared-strategy-window.store.ts) 中增加显式 `warmup` 与预热状态探测方法：

```typescript
export interface WindowWarmupTarget {
  readonly securityId: number;
  readonly source: StrategyRealtimeSource;
  readonly period: number;
  readonly requiredBars: number;
}

export interface WindowWarmupReport {
  readonly total: number;
  readonly succeeded: number;
  readonly skipped: number;
  readonly failed: number;
  readonly failedTargets: readonly { target: WindowWarmupTarget; error: string }[];
}

export class SharedStrategyWindowStore {
  // 现有 prepare / read / retainGroups 逻辑保持不变...

  /**
   * 盘前主动预热指定策略标的窗口
   */
  async warmup(
    marketData: StrategyRealtimeMarketDataPort,
    targets: readonly WindowWarmupTarget[],
    anchorAt: Date,
  ): Promise<WindowWarmupReport> {
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    const failedTargets: Array<{ target: WindowWarmupTarget; error: string }> = [];

    for (const target of targets) {
      const key = groupKey(target.securityId, target.source, target.period);
      const existing = this.groups.get(key);

      // 若已有且容量充足，直接跳过
      if (existing && existing.capacity >= target.requiredBars) {
        skipped += 1;
        continue;
      }

      try {
        const hydrated = await marketData.loadRealtimeWindow({
          securityId: target.securityId,
          source: target.source,
          period: target.period,
          anchorAt,
          requiredBars: target.requiredBars,
        });
        const group = buildGroup(hydrated.bars, target.requiredBars);
        this.groups.set(key, group);
        succeeded += 1;
      } catch (error) {
        failed += 1;
        failedTargets.push({
          target,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return Object.freeze({
      total: targets.length,
      succeeded,
      skipped,
      failed,
      failedTargets: Object.freeze(failedTargets),
    });
  }
}
```

### 2.3 触发与执行机制（双重保障）

预热执行由 `apps/signal` 统一托管，采用“**事件触发为主 + 09:20 定时保底**”：

1. **事件触发**：
   - 在 `SignalRealtimeStartupService.onApplicationBootstrap()` 以及 `SignalRegistry` 注册表更新（`reconcileRegistry`）时，提取所有活跃策略的三元组 `(securityId, source, period, maxRequiredBars)`，在后台异步调用 `warmup()`。
2. **09:20 定时保底屏障**：
   - 注册 `@Cron(CRON_PRE_MARKET_STRATEGY_WARMUP_0920)`。
   - 检查交易日日历（`TimezoneService.isTradingDay`），在 09:20 针对全量活跃策略执行一次扫描与补热，确保所有标的 100% 具备内存滑窗。

### 2.4 失败隔离与退化语义（Failure Isolation & Degradation）

- **单标的故障隔离**：某只股票预热失败（例如历史 K 线缺失、网络抖动），仅记录 Warning 日志并累加 `failedCount`，**绝对不阻塞其他标的的预热，也绝对不导致 Signal 服务崩溃**。
- **开盘自动退化兜底**：若某标的在 09:20 预热失败，当 09:31 首根 K 线到达时，`prepare()` 会自动走现有的按需拉取（On-demand Hydration）逻辑进行兜底补拉。

---

## 3. 质量门禁合规性审查

### 3.1 命名与词汇合规（`mist/docs/project-quality-governance-guide.md`）
- 严格遵循 `securityId`、`source`、`period`、`anchorAt` 等 canonical 词汇；
- 时间统一基于 `@app/timezone` 的 `Asia/Shanghai` 交易日；
- 绝不引入无作用域的全局 `ready`。

### 3.2 内存边界与奥卡姆剃刀（YAGNI）
- 内存队列严格遵循 `capacity = requiredBars` 限制，超出部分通过 `imputer.trim()` 自动弹出，防止内存泄漏；
- 预热逻辑直接复用现有的 `loadRealtimeWindow` 和 `imputer.hydrate()`，零重复造轮子。

---

## 4. 验证计划

1. **单元测试**：
   - `SharedStrategyWindowStore.spec.ts`：测试 `warmup` 成功载入、容量复用跳过、单标的异常隔离与报告生成。
   - `SignalRealtimeStartupService.spec.ts` / 调度测试：测试 09:20 触发与交易日跳过逻辑。
2. **集成测试**：
   - 模拟开盘首根 K 线到达，断言内存 `WindowGroup` 命中且未调用底层数据库查询（`kRepository.find` 次数为 0）。
