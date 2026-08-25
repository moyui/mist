# Design: Pre-Market Health Inspection, Subscription Reconciliation Alert (A10), and Timezone Consolidation

## Context

2026-08-23 巡检发现 QMT journal 中存在历史孤儿记录（`native_intent=2998` vs `native_result=2997`，孤儿项 `seq=2906, callSeq=2906, method=unsubscribe_quote, subId=723`）。由于该孤儿无活跃注册 bucket，启动恢复无法自动清除，导致 `reconciliationRequired=true`，QMT 订阅控制面（sync/subscribe/unsubscribe）被全面拒绝。

由于实时行情数据流（snapshot）和回测链路持续正常，无现有告警（A1~A9）能针对此状态及时点名告警，导致该问题持续 2 天未被发现。

同时，梳理中发现全系统的 Cron 表达式与时段逻辑分散在 `apps/schedule`、`apps/mist`、`libs/timezone` 各处。为了系统性保障交易日系统就绪并实现代码健康治理，构建**主动防御（09:05 盘前综合巡检）**、**被动防御（A10 专用对账阻塞实时告警）**与**时间体系集中收口（libs/timezone）**三位一体的闭环。

## Goals / Non-Goals

**Goals:**
- **时间体系权威收口**：在 `libs/timezone` 集中定义并导出全系统的 Cron 调度表达式、交易活动窗口常量与判定工具（如 `CRON_PRE_MARKET_INSPECTION_0905`、`CRON_SUBSCRIPTION_RESET_0915`、`CRON_POST_CLOSE_SYNC_NIGHTLY_2230`、`CRON_POST_CLOSE_SYNC_MORNING_0630`、`isIntradayAddWindow` 等）。
- **主动防御**：在 `apps/schedule` 建立交易日 **09:05** 触发的开盘前 5 维主动体检，每日必发企业微信体检简报；遇异常精准给出根因与一键恢复命令指引。
- **被动防御**：在 `mist-datasource` 导出低基数 OTel Gauge `mist_datasource_subscription_reconciliation_required`（0/1），并在 `mist-deploy` 中添加 OO SQL 规则 `A10_qmt_reconciliation_required`（P1）。
- **契约升级**：修复 `apps/notification` 与 `mist-deploy` 中对规则前缀固定为 2 字符（`Substring(0, 2)` / `slice(0, 2)` / `^A[1-9]_`）的假设，全面安全支持 `A10+`。
- **低噪音**：实时告警保持交易时段过滤集中在 `oo-alert-receiver`；盘前体检限定在交易日 09:05（09:15 订阅重置前 10 分钟）。

**Non-Goals:**
- 不改变 QMT journal 自身的 append-only 持久化格式或修复逻辑（孤儿记录清理与修复由运维 runbook 或 context observation 处理）。
- 不在告警指标中携带高基数标签（如 symbol、subId、seq、ownerId、error message）。
- 不引入自动强制擦除 Journal 的旁路破坏性恢复机制。

## Decisions

### 1. 全系统时间节点与 Cron 调度收口至 `libs/timezone`

在 `libs/timezone/src/` 下新增 `cron-schedules.const.ts`，并在 `index.ts` 集中导出：

```typescript
/**
 * Canonical Cron Expressions for A-share Trading Pipeline (Asia/Shanghai).
 */
export const CRON_PRE_MARKET_INSPECTION_0905 = '0 5 9 * * 1-5'; // 周一至周五 09:05
export const CRON_SUBSCRIPTION_RESET_0915 = '0 15 9 * * 1-5';     // 周一至周五 09:15
export const CRON_POST_CLOSE_SYNC_NIGHTLY_2230 = '30 22 * * 1-5'; // 周一至周五 22:30
export const CRON_POST_CLOSE_SYNC_MORNING_0630 = '30 6 * * 2-6';  // 周二至周六 06:30

/**
 * Canonical Window Minute Offsets.
 */
export const INTRADAY_ADD_WINDOW_START_MIN = 9 * 60 + 15; // 09:15
export const INTRADAY_ADD_WINDOW_END_MIN = 15 * 60;       // 15:00
```

并将 `isIntradayAddWindow` 从 `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts` 迁移至 `libs/timezone/src/trading-session.util.ts` 中统一维护，消除内联重复代码。

### 2. 09:05 盘前 5 维主动体检体系设计

在 `apps/schedule` 注册 `@Cron(CRON_PRE_MARKET_INSPECTION_0905, { timeZone: ASIA_SHANGHAI_TIMEZONE })`（周一至周五 09:05 触发，依赖 `TimezoneService.isTradingDay()` 校验交易日）：

| 检查维度 | 探测方式 | 合格判定标准（Pass 条件） | 异常诊断与排查指引 |
|---------|---------|-------------------------|------------------|
| **1. 数据源与 Journal** | HTTP GET probe `http://tdx-datasource:9001/health` 及 `http://qmt-datasource:9002/health` | `reconciliationRequired == false` 且 `journalHealthy == true` 且 `startupReconciliation.phase != 'degraded'` | 输出阻塞根因，生成并提示 `context-rebuild-observation.json` 放置路径与重启命令 |
| **2. 昨夜收盘 K 线完整性** | 查询 MySQL `k_lines` 表校验前一交易日数据 | 目标标的在上一交易日包含完整的 DAY、1m、5m、15m、30m、60m K 线无缺失 | 输出缺失标的与周期，附带手工补录执行命令：`syncPostClose({ targetDate, periods })` |
| **3. 订阅生命周期合规** | 查询 MySQL `realtime_subscription_assignments` 及订阅协调器状态 | 每源 `status=ACTIVE` 标的数 `<= 5` 且协调器处于就绪收敛态 | 提示超额或漂移标的列表，指导进入订阅操作台进行调整 |
| **4. 实时链路与通畅度** | 查询 Backend WS 客户端连接与 Bridge TCP 状态 | WS `connected == true`，`bridge_ready == 1`，心跳正常 | 提示断开的 WS/Bridge 端口与网络排查指引 |
| **5. 基础设施存活性** | Redis `PING` / 内存占用、MySQL 连接池、Signal `/health` | Redis 响应 `< 50ms` 且未达内存阈值，MySQL 连接池正常，Signal 状态 `ok` | 提示具体宕机或资源告急的基础设施容器名称 |

### 3. 深度智能微信体检简报设计

通过 `apps/notification` 向企业微信运维群推送 Markdown 结构化诊断卡片：

- **全绿态（All Green）**：
  ```markdown
  ### 🟢 09:05 盘前系统体检通过
  - **交易日期**：2026-08-25（星期二）
  - **数据源与 Journal**：TDX 🟢 | QMT 🟢（对账健康）
  - **昨夜收盘 K 线**：全周期完整（覆盖 5 活跃标的）🟢
  - **订阅就绪度**：TDX(3/5) 🟢 | QMT(2/5) 🟢
  - **实时通信链路**：WS 连接正常 🟢 | Bridge TCP 就绪 🟢
  - **基础设施**：MySQL 🟢 | Redis 🟢 | Signal 🟢
  > 距离 09:15 订阅重置还有 10 分钟，系统已就绪。
  ```
- **异常态（Red / Degraded）**：
  ```markdown
  ### 🔴 09:05 盘前体检发现异常（需立即介入）
  - **交易日期**：2026-08-25（星期二）
  - **🔴 故障项：QMT Journal 对账阻塞 (reconciliationRequired=true)**
    - **故障根因**：检测到历史孤儿记录（seq=2906），控制面（sync/subscribe）已被锁定
    - **受影响标的**：QMT 订阅标的 (000001.SZ, 600519.SH)
    - **⚡ 一键排查与恢复命令**：
      1. 登录主机：`ssh mist-box`
      2. 放置临时观察文件：`Set-Content F:\quant\MistAPI\datasource\state\context-rebuild-observation.json '{"native_subscribed_sub_ids":[...]}'`
      3. 重启数据源容器：`docker restart qmt-datasource`
  - **其他模块状态**：收盘K线 🟢 | 实时链路 🟢 | 基础设施 🟢
  ```

### 4. 被动防御：专用 Gauge 指标与 A10 规则

- **指标**：`mist_datasource_subscription_reconciliation_required`（0=正常，1=阻塞，标签 `source`）。
- **A10 规则**：
  ```json
  {
    "name": "A10_qmt_reconciliation_required",
    "severity": "P1",
    "stream_type": "metrics",
    "stream_name": "mist_datasource_subscription_reconciliation_required",
    "sql": "select max(value) as v from mist_datasource_subscription_reconciliation_required where source='qmt'",
    "operator": ">=",
    "threshold": 1,
    "period": 10,
    "frequency": 300,
    "silence": 30,
    "description": "QMT subscription control is blocked by journal reconciliation required — sync/subscribe rejected"
  }
  ```

### 5. 跨仓多位数规则前缀（`A10+`）契约解析升级

- **`apps/notification/src/oo-alert/oo-alert-receiver.controller.ts`**：
  - 将原 `alertName.slice(0, 2)` 重构为 `alertName.split('_')[0].toUpperCase()`。
- **`apps/notification/src/oo-alert/oo-alert.constants.ts`**：
  - `SEVERITY_BY_PREFIX` 字典中新增 `"A10": "P1"`。
- **`mist-deploy/scripts/test-docker-compose-config.ps1` & `sync-oo-alerts.ps1`**：
  - 正则由 `^A[1-9]_\w+$` 放宽为 `^A\d+_\w+$`；
  - 前缀截取 `$rule.name.Substring(0, 2)` 改为 `$rule.name.Split('_')[0]`；
  - `$severityByPrefix` 同步注册 `"A10" = "P1"`。

## Risks / Trade-offs

- **[风险 1: 09:05 盘前检查耗时过长影响 09:15 任务]**
  - *缓解*：5 维检查全部采用异步并发探针，超时控制在 5 秒以内，总体检耗时预计 < 1 秒，留足 10 分钟缓冲期。
- **[风险 2: 非交易日误跑误报]**
  - *缓解*：严格依赖 `TimezoneService.isTradingDay()` 判断 A 股真实交易日历，周末与法定节假日自动跳过。
- **[风险 3: 跨仓契约漂移]**
  - *缓解*：`mist-deploy` CI 门禁（`test-docker-compose-config.ps1`）强制验证 `rules.json` 与 `SEVERITY_BY_PREFIX` 锁。
