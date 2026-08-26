# 实施计划 — 盘前 09:05 运行时开关健康巡检与防断链治理

配套 OpenSpec change：`openspec/changes/add-pre-market-switch-health-inspection/`（proposal / design / tasks / delta specs 已就绪）。本计划提供代码级落地细节、文件修改规范、单元/集成测试套件及发布验证指南。

---

## 0. 质量约束与架构边界

| 维度 | 本次落实规范 |
|---|---|
| **主后端健康暴露** | `mist-backend`（`apps/mist`）提供免鉴权、低开销的 `GET /health` 端点，返回真实生效的 `productizationMode`、`strategyMode`、`redisAvailable`、`allowlistCount` 等属性。 |
| **09:05 巡检 6 维体系** | `apps/schedule` 中的 `PreMarketInspectionService` 将原 5 维巡检扩展为 6 维，新增「维度 6：运行时开关与防断链闸门 (`pipelineSwitches`)」。 |
| **断言严密性** | 核心开关（`REALTIME_PRODUCTIZATION_MODE`、`REALTIME_STRATEGY_MODE`、`TDX/QMT_REALTIME_MODE`、`MIST_REALTIME_REDIS_URL`、`NOTIFICATION_WECHAT_WEBHOOK`）必须全部处于 `on` / `builtin` / 有效配置状态；任意开关为 `off` 直接判定为 🔴 **FAILED**。 |
| **微信诊断卡片增强** | 微信卡片以单行紧凑形式展示全栈微服务开关摘要（`backend=on | signal=on | tdx=builtin | qmt=builtin | redis=ok | wechat=ok`）；遇异常提供精准的一键修复命令。 |
| **部署默认值收敛** | `mist-deploy` 部署编排层中，将实盘部署工作流及默认脚本中的 `realtime_productization_mode` 默认值从历史残留的 `off` 收敛升级为 `on`，根除 CI/CD 误覆盖风险。 |
| **测试先行与零回归** | 编写 `AppHealthController` 与 `PreMarketInspectionService` 针对第 6 维的单元与集成测试，全量测试套件 100% 通过。 |

---

## 1. 代码修改细节（File-by-File）

### 1.1 `apps/mist/src/health/app-health.vo.ts` (新建)
- **目标**：定义主后端健康端点响应 VO。
- **代码定义**：
  ```ts
  import { ApiProperty } from '@nestjs/swagger';

  export class BackendHealthVo {
    @ApiProperty({ example: 'ok' })
    status!: 'ok';

    @ApiProperty({ example: 'backend' })
    instance!: 'backend';

    @ApiProperty({ enum: ['off', 'shadow', 'on'], example: 'on' })
    productizationMode!: 'off' | 'shadow' | 'on';

    @ApiProperty({ enum: ['off', 'shadow', 'on'], example: 'on' })
    strategyMode!: 'off' | 'shadow' | 'on';

    @ApiProperty({ example: true })
    redisAvailable!: boolean;

    @ApiProperty({ example: 4 })
    allowlistCount!: number;
  }
  ```

### 1.2 `apps/mist/src/health/app-health.controller.ts` (新建)
- **目标**：实现免鉴权的 `GET /health` 端点。
- **核心逻辑**：
  ```ts
  import { Controller, Get } from '@nestjs/common';
  import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
  import { ConfigService } from '@nestjs/config';
  import { RealtimeRedisService } from '../realtime/realtime-redis.service';
  import { RealtimeSecurityAllowlistService } from '../realtime/realtime-security-allowlist.service';
  import { BackendHealthVo } from './app-health.vo';

  @ApiTags('health')
  @Controller()
  export class AppHealthController {
    constructor(
      private readonly config: ConfigService,
      private readonly redis: RealtimeRedisService,
      private readonly allowlist: RealtimeSecurityAllowlistService,
    ) {}

    @Get('health')
    @ApiOperation({ summary: 'Backend runtime health & switches' })
    @ApiResponse({ status: 200, type: BackendHealthVo })
    getHealth(): BackendHealthVo {
      const rawProd = this.config.get<string>('REALTIME_PRODUCTIZATION_MODE') ?? 'off';
      const prodMode = (rawProd === 'on' || rawProd === 'shadow') ? rawProd : 'off';
      const rawStrat = this.config.get<string>('REALTIME_STRATEGY_MODE') ?? 'off';
      const stratMode = (rawStrat === 'on' || rawStrat === 'shadow') ? rawStrat : 'off';

      return {
        status: 'ok',
        instance: 'backend',
        productizationMode: prodMode,
        strategyMode: stratMode,
        redisAvailable: this.redis.isAvailable(),
        allowlistCount: this.allowlist.getAssignedSecurityIds().length,
      };
    }
  }
  ```

### 1.3 `apps/mist/src/app.module.ts`
- **目标**：注册 `AppHealthController`。
- **修改位置**：`controllers` 数组引入 `AppHealthController`。

### 1.4 `apps/schedule/src/pre-market-inspection.service.ts`
- **目标**：实现「维度 6：运行时开关与防断链闸门 (`pipelineSwitches`)」，升级 6 维综合报告。
- **代码变更**：
  1. `PreMarketInspectionReport` 接口扩展：
     ```ts
     export interface PreMarketInspectionReport {
       readonly targetDate: string;
       readonly overallStatus: 'PASSED' | 'FAILED';
       readonly dimensions: {
         readonly datasource: DimensionCheckResult;
         readonly klines: DimensionCheckResult;
         readonly subscription: DimensionCheckResult;
         readonly realtime: DimensionCheckResult;
         readonly infrastructure: DimensionCheckResult;
         readonly pipelineSwitches: DimensionCheckResult;
       };
       readonly markdown: string;
       readonly sentToWechat: boolean;
     }
     ```
  2. 新增 `checkPipelineSwitches()` 方法：
     - 探针 1：`http://mist-backend:8001/health` 或 `BACKEND_HEALTH_URL`，断言 `productizationMode === 'on'`、`strategyMode === 'on'`、`redisAvailable === true`；
     - 探针 2：`http://signal:8010/health` 或 `SIGNAL_HEALTH_URL`，断言 `realtimeMode === 'on'`；
     - 探针 3：`http://tdx-datasource:9001/health`，断言 `realtimeMode === 'builtin'`；
     - 探针 4：`http://qmt-datasource:9002/health`，断言 `realtimeMode === 'builtin'`；
     - 探针 5：环境变量 `NOTIFICATION_WECHAT_WEBHOOK`，断言非空有效 URI；
     - 若有任意一项未满足：`passed = false`，汇总所有错误并生成 `remediation` 指令。
  3. `runInspection()` 主入口集成：
     ```ts
     const [datasource, klines, subscription, realtime, infrastructure, pipelineSwitches] =
       await Promise.all([
         this.checkDatasourceControlPlane(),
         this.checkHistoricalKLines(checkTime),
         this.checkSubscriptionLifecycle(),
         this.checkRealtimePipeline(),
         this.checkInfrastructure(),
         this.checkPipelineSwitches(),
       ]);

     const overallStatus: 'PASSED' | 'FAILED' =
       datasource.passed &&
       klines.passed &&
       subscription.passed &&
       realtime.passed &&
       infrastructure.passed &&
       pipelineSwitches.passed
         ? 'PASSED'
         : 'FAILED';
     ```
  4. 优化 `buildMarkdownReport()`：在 All Green 与 FAILED 卡片中以格式化行显示各开关状态。

---

## 2. 部署编排修改细节（mist-deploy）

### 2.1 `mist-deploy/.github/workflows/deploy-windows-mist-stack.yml`
- **目标**：将 `realtime_productization_mode` 的 default 属性由 `off` 升级为 `on`。
- **修改位置**：Line 72：
  ```yaml
  realtime_productization_mode:
    description: Realtime candle productization mode. Use on for production live evaluation.
    required: true
    default: on
    type: choice
    options:
      - on
      - shadow
      - off
  ```

### 2.2 `mist-deploy/scripts/common/deploy-defaults.ps1` & `docker/.env.example`
- **目标**：默认值同步升级为 `on`。
- **修改位置**：
  - `deploy-defaults.ps1`：`$defaults.RealtimeProductizationMode = "on"`
  - `docker/.env.example`：`REALTIME_PRODUCTIZATION_MODE=on`

### 2.3 `mist-deploy/scripts/test-docker-compose-config.ps1` & `scripts/test-workflow-config.ps1`
- **目标**：更新 CI 断言，确保 CI 门禁验证通过。

---

## 3. 测试套件规范

### 3.1 `apps/mist/src/health/app-health.controller.spec.ts`
- **测试场景**：
  1. 当 `REALTIME_PRODUCTIZATION_MODE=on`、`REALTIME_STRATEGY_MODE=on`、Redis 就绪时，返回 `productizationMode: 'on'`, `strategyMode: 'on'`, `redisAvailable: true`。
  2. 当模式未设置时，回退到 `'off'`。
  3. 当 Redis 不可用时，返回 `redisAvailable: false`。

### 3.2 `apps/schedule/src/pre-market-inspection.service.spec.ts`
- **测试场景**：
  1. 全量 6 维正常：返回 `overallStatus: 'PASSED'`，卡片包含 `🟢 09:05 盘前系统体检通过` 与 `backend=on` 摘要。
  2. `mist-backend` 返回 `productizationMode: 'off'`：返回 `overallStatus: 'FAILED'`，卡片包含 `❌ Backend Candle 产品化处于 off` 及一键修复指令。
  3. `signal` 返回 `realtimeMode: 'off'`：返回 `overallStatus: 'FAILED'`。
  4. `tdx-datasource` 或 `qmt-datasource` 返回 `realtimeMode: 'off'`：返回 `overallStatus: 'FAILED'`。
  5. 微信 Webhook 未配置：返回 `overallStatus: 'FAILED'`。

---

## 4. 实施与验证步骤

### 步骤 1：主后端健康端点实现与测试
- 编写 `app-health.vo.ts`、`app-health.controller.ts` 与 `app-health.controller.spec.ts`。
- 运行：`npm run test apps/mist/src/health/`

### 步骤 2：Schedule 6 维巡检实现与测试
- 修改 `pre-market-inspection.service.ts`，扩展 `pipelineSwitches` 维度与卡片模板。
- 运行：`npm run test apps/schedule/src/pre-market-inspection`

### 步骤 3：部署编排配置默认值升级
- 修改 `mist-deploy` 工作流与脚本默认值。
- 运行：`powershell -File scripts/test-docker-compose-config.ps1`、`powershell -File scripts/test-workflow-config.ps1`

### 步骤 4：CI/CD 验证与生产部署
- 提交并推送 `mist` 与 `mist-deploy` master 分支。
- 触发 GitHub Actions 构建与 Windows Appliance 部署，验证生产 09:05 巡检探针与端点就绪。
