# Design: 盘前 09:05 运行时开关健康巡检与防断链治理

## 1. 架构与链路概览

```
09:05 Cron (apps/schedule)
  │
  ├── 1. Datasource & Journal Control Plane (TDX 9001 / QMT 9002)
  ├── 2. Historical K-Lines Completeness (MySQL Table k)
  ├── 3. Subscription Assignments Lifecycle (MySQL Assignments)
  ├── 4. Realtime Bridge TCP & WS (Datasource Health)
  ├── 5. Infrastructure Liveness (MySQL & Signal 8010)
  │
  └── 6. [NEW] Pipeline Switches & Gating (运行时开关与防断链闸门)
        ├── Probe Backend (8001/health)  -> productizationMode=='on', strategyMode=='on', redis=true
        ├── Probe Signal (8010/health)   -> realtimeMode=='on'
        ├── Probe TDX (9001/health)      -> realtimeMode=='builtin'
        ├── Probe QMT (9002/health)      -> realtimeMode=='builtin'
        └── Check Webhook Env            -> NOTIFICATION_WECHAT_WEBHOOK is set
```

---

## 2. 详细技术方案

### 2.1 主后端健康端点（`apps/mist/src/health/app-health.controller.ts`）

- **路由**：`GET /health`（无需认证，低开销）
- **返回结构**（`BackendHealthVo`）：
  ```typescript
  export interface BackendHealthVo {
    status: 'ok';
    instance: 'backend';
    productizationMode: 'off' | 'shadow' | 'on';
    strategyMode: 'off' | 'shadow' | 'on';
    redisAvailable: boolean;
    allowlistCount: number;
  }
  ```
- **实现逻辑**：
  - 从 `ConfigService` 读取 `REALTIME_PRODUCTIZATION_MODE`（默认 `'off'`）与 `REALTIME_STRATEGY_MODE`（默认 `'off'`）；
  - 从 `RealtimeRedisService.isAvailable()` 读取 Redis 连通就绪状态；
  - 从 `RealtimeSecurityAllowlistService.getAssignedSecurityIds().length` 读取已加载白名单数。

### 2.2 09:05 巡检第 6 维「运行时开关与链路闸门」设计

在 `apps/schedule/src/pre-market-inspection.service.ts` 新增方法 `checkPipelineSwitches()`：

1. **探测端点与期望值**：
   - **Backend 探针**（`http://mist-backend:8001/health` 或 `http://127.0.0.1:8001/health`）：
     - `productizationMode` 必须为 `'on'`（若为 `'off'`，断言失败：`"Backend Candle 产品化处于 off (未聚合/未写Redis)"`）；
     - `strategyMode` 必须为 `'on'`（若为 `'off'`，断言失败：`"Backend 策略派发处于 off (BullMQ 任务未挂载)"`）；
     - `redisAvailable` 必须为 `true`（若为 `false`，断言失败：`"Backend Realtime Redis 处于不可用状态"`）。
   - **Signal 探针**（`http://signal:8010/health`）：
     - `realtimeMode` 必须为 `'on'`（若为 `'off'`，断言失败：`"Signal 实时策略求值处于 off (不持久化信号/不触发告警)"`）。
   - **TDX 数据源探针**（`http://tdx-datasource:9001/health`）：
     - `realtimeMode` 必须为 `'builtin'`（若为 `'off'`，断言失败：`"TDX 实时推流桥接处于 off"`）。
   - **QMT 数据源探针**（`http://qmt-datasource:9002/health`）：
     - `realtimeMode` 必须为 `'builtin'`（若为 `'off'`，断言失败：`"QMT 实时推流桥接处于 off"`）。
   - **通知通道配置核查**：
     - `NOTIFICATION_WECHAT_WEBHOOK` 必须为有效 URL。

2. **报告对象扩展**：
   - `PreMarketInspectionReport.dimensions` 新增 `pipelineSwitches: DimensionCheckResult`；
   - 总体判定：`overallStatus = (6个维度均 passed ? 'PASSED' : 'FAILED')`。

3. **精准修复指引（Remediation）**：
   - 若 `productizationMode` 或 `strategyMode` 为 `off`：
     ```powershell
     Set-DockerEnvValue -Path F:\MistDocker\.env -Key REALTIME_PRODUCTIZATION_MODE -Value on
     Set-DockerEnvValue -Path F:\MistDocker\.env -Key REALTIME_STRATEGY_MODE -Value on
     docker compose up -d --force-recreate mist-backend mist-signal
     ```

### 2.3 微信诊断卡片模板设计

#### 🟢 All Green 状态模板：
```markdown
### 🟢 09:05 盘前系统体检通过 (All Green)
- **目标交易日**: 2026-08-26
- **运行时开关**: `backend=on` | `signal=on` | `tdx=builtin` | `qmt=builtin` | `redis=ok` | `wechat=ok`
- **数据源控制面**: TDX & QMT 桥接就绪
- **历史 K 线完整性**: 4 标的前一交易日各周期数据齐全 (2026-08-25)
- **订阅生命周期**: 4 标的活跃订阅 (QMT: 3, TDX: 1)
- **实时链路**: Bridge TCP & WebSocket 连通正常
- **基础设施**: MySQL & Signal 存活性正常
```

#### 🔴 FAILED 状态模板：
```markdown
### 🔴 09:05 盘前体检发现异常 (需立即介入)
- **目标交易日**: 2026-08-26
- **运行时开关**: 🔴 异常 (`backend=off`)
  > ❌ Backend Candle 产品化处于 off (未聚合/未写Redis)
- **数据源控制面**: 🟢 正常
- **历史 K 线完整性**: 🟢 正常
- **订阅生命周期**: 🟢 正常
- **实时链路**: 🟢 正常
- **基础设施**: 🟢 正常

#### 🛠️ 一键修复指引
1. 在 Windows 宿主机执行：
   Set-DockerEnvValue -Path F:\MistDocker\.env -Key REALTIME_PRODUCTIZATION_MODE -Value on
   docker compose up -d --force-recreate mist-backend
```

### 2.4 部署工作流与配置默认值收敛

- **`mist-deploy/.github/workflows/deploy-windows-mist-stack.yml`**：
  - `realtime_productization_mode` 的 `default` 属性由 `off` 改为 `on`；
- **`mist-deploy/scripts/common/deploy-defaults.ps1`**：
  - 默认值由 `off` 改为 `on`；
- **`mist-deploy/docker/.env.example`**：
  - `REALTIME_PRODUCTIZATION_MODE=on`、`REALTIME_STRATEGY_MODE=on`。
