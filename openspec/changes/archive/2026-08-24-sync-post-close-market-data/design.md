# Design: sync-post-close-market-data

## 1. 架构定位与数据链路

### 1.1 核心架构与 OpenObserve 闭环

```
 [交易日 15:00 收盘]
        │
        ├─ QMT 本地 17:00+ 开始盘后清算下载 (18:30~20:00+ 就绪)
        └─ TDX 本地等待每周手动下载
        │
 ┌──────┴────────────────────────────────────────────────────────────────────────┐
 │ 【第一轮：晚间主调度】22:30 (周一至周五 @Cron('30 22 * * 1-5'))                │
 │  1. 周期矩阵：DAY + 1m + 5m + 15m + 30m + 60m (周五加WEEK, 月末加MONTH)         │
 │  2. 针对每个 ACTIVE 标的，路由至配置的权威源 (QMT / TDX)                         │
 │  3. 【核心】DataFreshnessValidator (数据就绪与最新性自检):                      │
 │      ├─ 是否包含目标日？(日线日期 == targetDate)                                │
 │      ├─ 分钟线是否达到 15:00 且根数达标？(1m=240根, 5m=48根, 15m=16根...)       │
 │      ├─ [READY] ──> MySQL ON DUPLICATE KEY UPDATE 幂等持久化 (有界并发限制 5)   │
 │      └─ [NOT_LATEST / INCOMPLETE_BARS] ──> 拦截不落库，记录诊断报告             │
 └──────┬────────────────────────────────────────────────────────────────────────┘
        │ (沉淀一整夜，等待 QMT 完全生成或本地就绪)
 ┌──────┴────────────────────────────────────────────────────────────────────────┐
 │ 【第二轮：次日晨间兜底重试】06:30 (周二至周六 @Cron('30 6 * * 2-6'))             │
 │  1. 目标日期：前一个交易日 (利用 TimezoneService 排除周末与节假日)              │
 │  2. 重新扫描：针对昨晚标记为 NOT_READY 或未完成的标的进行第二轮自动同步          │
 │  3. 在 09:15 盘前系统启动前，确保前一日全量历史 K 线 100% 权威就绪              │
 └──────┬────────────────────────────────────────────────────────────────────────┘
        │
        ├─ ① 【MySQL 持久化】: `k` 表 (主键: security_id, period, timestamp)
        │
        ├─ ② 【结构化日志输出】:
        │     - `[PostCloseSync] event=sync_started targetDate=2026-08-24 window=nightly_2230 totalSecurities=20`
        │     - `[PostCloseSync] event=task_unready securityCode=300059 source=tdx period=1440 freshnessStatus=NOT_LATEST reason="..."`
        │     - `[PostCloseSync] event=sync_finished targetDate=2026-08-24 succeeded=18 notReady=2 failed=0 totalKLines=4800 durationMs=1250`
        │
        └─ ③ 【OTel Metrics 指标流】:
              - `mist_post_close_sync_tasks_total` (counter: status, source, period)
              - `mist_post_close_sync_klines_saved_total` (counter: source, period)
              - `mist_post_close_sync_duration_seconds` (histogram: window)
              - `mist_post_close_sync_last_success_age_seconds` (observable gauge: window)
                    │
                    ▼
 [OpenObserve (OO) 监控与 SQL 告警引擎]
        │
        ├─ 规则 A8: `A8_post_close_sync_failed` (Severity: P1)
        │  SQL: `select sum(value) as v from mist_post_close_sync_tasks_total where status='failed'`
        │  触发: failed >= 1 (数据库不可用/源端致命异常)
        │
        ├─ 规则 A9: `A9_post_close_sync_unready_surge` (Severity: P2)
        │  SQL: `select sum(value) as v from mist_post_close_sync_tasks_total where status='not_ready'`
        │  触发: 06:30 晨间兜底后依然未就绪数量过多 (提醒人工介入)
        │
        ▼
 [apps/notification: oo-alert 队列] ──> 企业微信 / 微信机器人实时播报
```

### 1.2 为什么废除 HTTP 接口？
1. **纯后台批处理契约**：收盘同步由 `apps/schedule` 内部定时触发，无需对外暴露任何 HTTP Controller；
2. **符合 OO 架构规范**：按照 `subscription-lifecycle-metrics.ts` 既定原则（*“Diagnostics then go through OpenObserve — no HTTP read endpoints are restored”*），运行状态与异常诊断全部由 OpenObserve 统一呈现，杜绝接口蔓延。

---

## 2. 核心接口与数据契约设计

### 2.1 状态枚举与自检契约（`DataFreshnessStatus`）

```typescript
export enum DataFreshnessStatus {
  READY = 'READY', // 数据完整且已覆盖目标交易日
  NOT_LATEST = 'NOT_LATEST', // 数据源停留在老日期（如 TDX 尚未手动下载，或 QMT 尚未生成）
  INCOMPLETE_BARS = 'INCOMPLETE_BARS', // 分钟线根数不足或未覆盖收盘时刻（15:00）
  SUSPENDED = 'SUSPENDED', // 标的停牌（正常无成交数据）
}

export interface FreshnessValidationResult {
  status: DataFreshnessStatus;
  barCount: number;
  expectedBarCount: number;
  latestBarTime?: string;
  reason?: string;
}
```

- **日线（`Period.DAY`）自检规则**：
  - 返回的 bars 中必须存在 `date === targetDate`（`yyyy-MM-dd`）的 bar；
- **分钟线（`1m`, `5m`, `15m`, `30m`, `60m`）自检规则**：
  - 最后一条 bar 的时间戳必须 `>= 15:00:00`；
  - 预期标准根数门禁（非停牌正常交易日）：
    - `Period.ONE_MIN`：240 根
    - `Period.FIVE_MIN`：48 根
    - `Period.FIFTEEN_MIN`：16 根
    - `Period.THIRTY_MIN`：8 根
    - `Period.SIXTY_MIN`：4 根
  - 若 0 根且标的未停牌，或根数不足，判定为 `NOT_LATEST` / `INCOMPLETE_BARS` 并拦截写入。

### 2.2 内部领域选择契约（`SyncPostCloseCriteria`）

遵循 `mist-backend-code-style-guide.md` 第 4.1 节，内部选择条件使用 `Criteria`：

```typescript
export interface SyncPostCloseCriteria {
  targetDate?: Date; // 目标交易日（默认当日北京时间）
  periods?: Period[]; // 默认全周期 [DAY, 1m, 5m, 15m, 30m, 60m]
  securityCodes?: string[]; // 默认所有 ACTIVE 标的
  sourceOverride?: DataSource; // 可选覆盖数据源
  concurrencyLimit?: number; // 标的并发上限（默认 5）
  window?: 'nightly_2230' | 'morning_0630' | 'manual';
}

export interface SecuritySyncTaskResult {
  securityCode: string;
  period: Period;
  source: DataSource;
  success: boolean;
  freshnessStatus: DataFreshnessStatus;
  count: number;
  error?: string;
}

export interface PostCloseSyncReport {
  targetDate: string; // YYYY-MM-DD
  window: string;
  totalSecurities: number;
  totalTasks: number;
  succeededTasks: number;
  notReadyTasks: number;
  failedTasks: number;
  totalKLinesSaved: number;
  durationMs: number;
  details: SecuritySyncTaskResult[];
}
```

---

## 3. OpenObserve 可观测性与告警设计

### 3.1 OTel Metrics 指标定义（`apps/mist/src/collector/observability/post-close-sync-metrics.ts`）

```typescript
// 1. 同步任务计数器
mist_post_close_sync_tasks_total (Counter)
  - Labels: status (succeeded | not_ready | failed), source (qmt | tdx | east_money), period (1440 | 1 | 5 ...)

// 2. K线保存总数计数器
mist_post_close_sync_klines_saved_total (Counter)
  - Labels: source (qmt | tdx | east_money), period (1440 | 1 | 5 ...)

// 3. 执行耗时直方图
mist_post_close_sync_duration_seconds (Histogram)
  - Labels: window (nightly_2230 | morning_0630 | manual)

// 4. 距离上一次成功同步过去的秒数
mist_post_close_sync_last_success_age_seconds (ObservableGauge)
  - Labels: window (nightly_2230 | morning_0630)
```

### 3.2 OpenObserve SQL 告警规则（`mist-deploy/oo-alerts/rules.json`）

```json
[
  {
    "name": "A8_post_close_sync_failed",
    "severity": "P1",
    "stream_type": "metrics",
    "stream_name": "mist_post_close_sync_tasks_total",
    "sql": "select sum(value) as v from mist_post_close_sync_tasks_total where status='failed'",
    "operator": ">=",
    "threshold": 1,
    "period": 10,
    "frequency": 300,
    "silence": 15,
    "description": "Post-close market data sync failed for one or more securities — check provider/database connectivity"
  },
  {
    "name": "A9_post_close_sync_unready_surge",
    "severity": "P2",
    "stream_type": "metrics",
    "stream_name": "mist_post_close_sync_tasks_total",
    "sql": "select sum(value) as v from mist_post_close_sync_tasks_total where status='not_ready'",
    "operator": ">=",
    "threshold": 5,
    "period": 15,
    "frequency": 600,
    "silence": 30,
    "description": "Post-close market data sync unready tasks >= 5 — provider download is delayed or missing"
  }
]
```

### 3.3 通知集成（`apps/notification`）

在 `apps/notification/src/oo-alert/oo-alert.constants.ts` 中同步映射：
```typescript
export const SEVERITY_BY_PREFIX: Readonly<Record<string, OoAlertSeverity>> = {
  A1: 'P0',
  A2: 'P0',
  A3: 'P1',
  A4: 'P1',
  A5: 'P2',
  A6: 'P2',
  A7: 'P1',
  A8: 'P1', // 收盘同步失败告警 (P1)
  A9: 'P2', // 收盘同步未就绪激增告警 (P2)
};
```
当 OO 规则触发时，由现有的 `oo-alert-receiver.controller.ts` 接收并自动投递至企业微信机器人。
