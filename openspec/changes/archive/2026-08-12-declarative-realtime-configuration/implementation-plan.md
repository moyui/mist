# Implementation Plan: declarative-realtime-configuration

> spec 确认后按本计划落地。改动：**mist 仓**（backend 三层重构 + migration 017）
> 与 **mist-deploy 仓**（写通道脚本/workflow/.env 清理）。本计划为普通 markdown。

## 0. 关键实现决策（实施前定稿）

- **定时收敛用 reset 策略**（`syncSubscriptions(desired)` 全量对齐）——探索确认
  control 无单独 `unsubscribe` 方法；reset 是全量协议（桥侧 diff），天然覆盖
  外部增/删 assignment 场景，声明式语义最清晰。60s 周期 × 个位数标的，
  协议开销可忽略。
- **RuntimeConfigService 内存缓存**：`toVo()` 是同步方法（L298-348），
  auto_reconcile 从 DB 读是异步——新 service 提供 `getAutoReconcileCached()`（同步
  内存缓存）+ `refresh()`（异步，coordinator 定时轮驱动）。
- **allowlist 统一 DB 读**：`initialize()` 删 env/lifecycle 分支后签名去掉
  `environmentName` 参数；assigned 刷新由 coordinator 定时轮驱动
  （`refreshAssignedFromDb`），保持单一数据流（coordinator 驱动）。
- **migration 在 mist 仓**（探索确认：`deploy/database/migrations/` 属 mist 仓，
  当前最高 016，新表为 017）。

## 1. 配置层（mist 仓）

### 1.1 新实体 `libs/shared-data/src/entities/runtime-config.entity.ts`

```ts
@Entity('runtime_configs')
export class RuntimeConfig {
  @PrimaryColumn({ name: 'config_key', type: 'varchar', length: 128 })
  configKey: string;

  @Column({ name: 'config_value', type: 'varchar', length: 512 })
  configValue: string;

  @Column({ name: 'updated_at', type: 'datetime', precision: 6,
            default: () => 'CURRENT_TIMESTAMP(6)' })
  updatedAt: Date;

  @Column({ name: 'updated_by', type: 'varchar', length: 64, default: '' })
  updatedBy: string;

  @Column({ name: 'comment', type: 'varchar', length: 255, default: '' })
  comment: string;
}
```
注册进 `app.module.ts` entities 数组（L132-146）。

### 1.2 migration `deploy/database/migrations/017_create_runtime_configs.sql`

仿 015/016 风格（preflight `information_schema` 断言 + postflight）：

```sql
-- Runtime configs (declarative-realtime-configuration)
-- Production preflight on <date>: runtime_configs absent ...
CREATE TABLE IF NOT EXISTS runtime_configs (
  config_key VARCHAR(128) NOT NULL,
  config_value VARCHAR(512) NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_by VARCHAR(64) NOT NULL DEFAULT '',
  comment VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- one-shot migration: auto_reconcile initial row = 'true' (production is
-- lifecycle=on; 一把梭 per user decision, no progressive phase)
INSERT INTO runtime_configs (config_key, config_value, updated_by, comment)
SELECT 'realtime_subscription_auto_reconcile', 'true', 'migration:017', 'declarative config one-shot (was lifecycle_mode=on)'
WHERE NOT EXISTS (SELECT 1 FROM runtime_configs WHERE config_key = 'realtime_subscription_auto_reconcile');
```

### 1.3 新 `apps/mist/src/realtime-subscriptions/runtime-config.service.ts`

```ts
@Injectable()
export class RuntimeConfigService {
  constructor(
    @InjectRepository(RuntimeConfig) private readonly configs: Repository<RuntimeConfig>,
    private readonly clock: Clock,
  ) {}

  private cachedAutoReconcile: boolean = false;  // 内存缓存（启动默认 false，首轮刷新后真值）

  /** 同步读缓存（toVo 等同步路径用） */
  getAutoReconcileCached(): boolean { return this.cachedAutoReconcile; }

  /** 异步刷新（coordinator 定时轮每轮调用）；DB 无行 → 保持当前缓存 */
  async refresh(): Promise<void> {
    const row = await this.configs.findOne({ where: { configKey: AUTO_RECONCILE_KEY } });
    if (row) this.cachedAutoReconcile = row.configValue === 'true';
  }
}
```
常量 `AUTO_RECONCILE_KEY = 'realtime_subscription_auto_reconcile'`（放
`realtime-subscription.constants.ts`）。

### 1.4 allowlist service 改造（`realtime/realtime-security-allowlist.service.ts`）

- `initialize(source)`：签名删 `environmentName` 参数；删 L46-58 mock 分支外的
  env 分支——改为：
  ```ts
  async initialize(source: DataSource.TDX | DataSource.QMT): Promise<void> {
    if (this.assignedEntries.has(source)) return;
    if (isMockMode()) { /* mock 分支保留 */ }
    await this.refreshAssignedFromDb(source);
  }
  ```
- 新增 `refreshAssignedFromDb(source)`：读 DB assignments（复用
  `resolveExact` 校验语义——查询 enabled+ACTIVE 的 formatCode，逐条
  `resolveExact` 失败关闭），写入 `assignedEntries`（含跨源冲突校验逻辑，
  从原 L70-81 提取为私有方法保留）。
- 删除 `parse()`（env 读取点）、`TDX/QMT_REALTIME_ALLOWLIST` 相关。
- `replaceAssigned/replaceEffective` 保留（coordinator 收敛路径仍用）。

### 1.5 `libs/config/src/validation.schema.ts`

- 删 `REALTIME_SUBSCRIPTION_LIFECYCLE_MODE` Joi（L152-158）、
  `TDX_REALTIME_ALLOWLIST`（L114）、`QMT_REALTIME_ALLOWLIST`（L145-150）、
  互斥校验段（L247-257 中 mode=on 冲突分支；`REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL`
  校验保留）。

## 2. 协调层（mist 仓，coordinator 改造）

### 2.1 `realtime-subscription-lifecycle.coordinator.ts`

- **删 `isEnabled()`**（L165-169）及其全部调用点：`onModuleInit`（L103 提前
  return 删除——事件订阅**恒挂载**）、`requestIncrementalReconciliation`（L117）、
  `runWeekday0915Barrier`（L138）。
- **构造注入**加 `private readonly runtimeConfig: RuntimeConfigService`。
- **onModuleInit 追加**：
  ```ts
  await this.runtimeConfig.refresh();   // 首轮缓存
  const intervalMs = Number(this.config.get('REALTIME_RECONCILE_INTERVAL_MS') ?? 60_000);
  this.schedulerRegistry.addInterval(
    'realtime-subscription-reconcile',
    setInterval(() => void this.runScheduledReconciliation(), intervalMs),
  );
  ```
  （`SchedulerRegistry` 注入；ScheduleModule.forRoot() 已就绪，module L15；
  幂等：onModuleInit 仅一次。OnModuleDestroy 里 `deleteInterval`。）
- **新增 `runScheduledReconciliation()`**（声明式收敛核心）：
  ```ts
  private async runScheduledReconciliation(): Promise<void> {
    if (this.shuttingDown) return;
    const before = this.runtimeConfig.getAutoReconcileCached();
    await this.runtimeConfig.refresh();
    const after = this.runtimeConfig.getAutoReconcileCached();
    if (!after) return;                          // off：跳过（保留现有订阅）
    if (!before && after) {                      // false→true：立即全量对齐一次
      for (const source of REALTIME_SUBSCRIPTION_SOURCES) this.enqueue(source, 'reset', 'auto_reconcile_enabled');
      return;
    }
    // 常规轮次：每源刷新 assigned + 增量收敛（声明式对齐 DB 期望）
    for (const source of REALTIME_SUBSCRIPTION_SOURCES) {
      await this.allowlist.refreshAssignedFromDb(source);
      this.enqueue(source, 'reset', 'scheduled_reconcile');
    }
  }
  ```
  - 定时轮用 **reset**（D0 决策）：`runReconciliation` 的 reset 分支
    `syncSubscriptions(desired)` 全量对齐——外部增删 assignment 均在下一轮生效。
  - `RealtimeLifecycleTrigger` 类型加 `'scheduled_reconcile' | 'auto_reconcile_enabled'`
    （observation.store.ts L10-13）。
- **`refreshDesiredState` 保留**（事务写路径调用，仍走 applyAssignedRoutes）；
  `requestIncrementalReconciliation` 的 `isEnabled` 检查删除（由定时闸门统一管控）。

### 2.2 module 装配（`realtime-subscription.module.ts`）

- providers 加 `RuntimeConfigService`；imports 加
  `TypeOrmModule.forFeature([RuntimeConfig])`。

## 3. 状态层（mist 仓）

### 3.1 `realtime/observability/subscription-lifecycle-metrics.ts`（新增，仿 candle-metrics.ts）

```ts
export function registerSubscriptionLifecycleMetrics(
  observations: RealtimeSubscriptionLifecycleObservationStore,
  allowlist: RealtimeSecurityAllowlistService,
): void {
  if (_registered) return;
  const meter = metrics.getMeter('mist-backend', '0.1.0');
  // 每 source 一个 label（tdx|qmt），gauge：
  // mist_realtime_subscription_desired_count{source}
  // mist_realtime_subscription_active_count{source}
  // mist_realtime_subscription_converged_count{source}
  // mist_realtime_subscription_deferred_removal_count{source}
  // mist_realtime_subscription_last_attempt_age_seconds{source}
  // mist_realtime_subscription_last_success_age_seconds{source}
  // mist_realtime_subscription_trigger_total{source,trigger}   (计数，observable gauge)
  // mist_realtime_subscription_result_total{source,result}
  // mist_realtime_allowlist_assigned_total{source}
  // mist_realtime_allowlist_effective_total{source}
  // 数据源：observations.health(autoReconcile, new Date()) + allowlist 计数
  // 低基数：source/trigger/result 有界枚举；无 symbol label
}
```
- `health(mode)` 的 mode 参数改为 `mode: 'on' | 'off'` 语义映射
  auto_reconcile（true→'on'，false→'off'），由 main.ts 挂载处传
  `runtimeConfig.getAutoReconcileCached()`——**health() 补生产消费者**（spec D5）。
- `main.ts` L15-21 旁追加 `registerSubscriptionLifecycleMetrics(...)`。

### 3.2 `service.toVo()`（L317-318）

```ts
const lifecycleEnabled = this.runtimeConfig.getAutoReconcileCached();
```
（RuntimeConfigService 注入 service；VO 的 `convergenceReason: 'lifecycle_disabled'`
语义保留——auto_reconcile=false 时仍输出；枚举不改。）

## 4. 写通道（mist-deploy 仓）

### 4.1 `scripts/set-realtime-business-allowlist.ps1` 改造为 DB 直写版
- 保留：`Resolve-RealtimeBusinessAllowlist`（5 只上限/格式/去重）、
  `Assert-RealtimeBusinessAllowlistDatabase`（probe.cjs 精确匹配校验）。
- 改：不再写 .env / force-recreate；改为 **docker exec mist-backend 跑
  mysql 客户端**（或经 `mysql` 容器）执行 assignments 事务写：
  - DELETE 不存在的 + INSERT/UPDATE 变更（先备份旧值到审计表/记录）；
  - 审计：`runtime_configs` 旁新增 `realtime_subscription_assignment_audit`？——
    简化：写审计行到新表 `runtime_configs` 不适配，**变更前旧值输出到
    workflow/脚本日志** + assignments 变更走既有表（`realtime_subscription_assignments`
    有唯一约束/FK），`updated_by` 无列——**审计=脚本输出旧值 + 变更 SQL 落
    evidence**（D6 按"旧值备份 + updated_by='ops:ssh' 语义记录于变更日志"实现）。
  - 写完后不重启 backend——等 ≤60s 定时收敛（纯声明式）。
- 调用方式：macOS `ssh mist-box "powershell -File ..."`（Change 2 通道）。

### 4.2 退役
- `scripts/set-realtime-subscription-lifecycle-mode.ps1` 退役（auto_reconcile
  写入 runbook 化：一条 SQL + 审计说明）。
- `.github/workflows/set-tdx-allowlist-stress.yml` 退役（校验不可绕过）。
- `.env` / compose / `.env.example`：删 `TDX_REALTIME_ALLOWLIST`、
  `QMT_REALTIME_ALLOWLIST`、`REALTIME_SUBSCRIPTION_LIFECYCLE_MODE`。

### 4.3 7 处 TODO(shrink) readback 处置
- `set-realtime-business-allowlist.ps1` L119-122 readback → 改 DB 直查
  assignments（脚本内 SELECT 断言）；`health-check-docker-appliance.ps1`
  L379-384 throw 段 → OO/DB 检查（或删除，runbook 指引 OO 查询）；
  `run-*.ps1` 注释段清理；`test-*.ps1` 断言更新（`disabled_by_shrink` 标记
  → 新语义）。

### 4.4 runbook（`docs/runbooks/windows-openssh-ops.md` 增节或新文档）
- 写配置章节：改 allowlist（ssh + ps1 DB 直写版）、改 auto_reconcile
  （SQL + 审计）、≤60s 收敛验证（OO gauge）。

## 5. 测试（mist 仓）

| 文件 | 改动 |
|---|---|
| `realtime-subscription-lifecycle.coordinator.spec.ts` | `buildCoordinator` 去 mode 参数（L404-417 改传 RuntimeConfigService mock）；新增：定时收敛（settleRounds 后 syncSubscriptions 收到全量 desired）、外部删 assignment 后下一轮 unsubscribe 生效（reset 全量）、false→true 立即 reset、true→false 跳过、`REALTIME_RECONCILE_INTERVAL_MS` 生效 |
| `realtime-security-allowlist.service.spec.ts` | initialize 去 env；`refreshAssignedFromDb` DB 查询断言；跨源冲突保留 |
| `runtime-config.service.spec.ts`（新增） | 初始缓存 false；refresh 读到 'true' 后缓存 true；DB 无行保持缓存 |
| `realtime-subscription.service.spec.ts` | toVo 的 lifecycleEnabled 断言改为 RuntimeConfigService mock 缓存值 |
| `observation.store.spec.ts` | trigger 新枚举（scheduled_reconcile/auto_reconcile_enabled）断言 |
| `subscription-lifecycle-metrics.spec.ts`（新增） | 10 gauge 注册与回调值、低基数护栏（无 symbol label） |
| `app.module.mock.spec.ts` | `REALTIME_SUBSCRIPTION_LIFECYCLE_MODE` 引用清理 |

## 6. 验证命令

```bash
# mist 仓（worktree 分支）
pnpm run lint:check && pnpm run typecheck
env TZ=UTC pnpm run test:ci          # 全量 + --forceExit（CI 同款）
pnpm run ci:contracts                # 跨仓契约（含 datasource 引用清理）
openspec validate declarative-realtime-configuration --strict

# deploy 仓
pwsh-preview scripts/test-set-realtime-business-allowlist.ps1   # 改造后门禁
pwsh-preview scripts/test-docker-compose-config.ps1             # .env 清理断言
```

## 7. 生产落地（实盘线程，部署后）

1. 部署顺序：migration 017（mist-migrate 跑）→ backend 新镜像
   （读 DB 开关）→ deploy .env 清理同一批。
2. HIL：ssh 改 DB assignments（+1/-1 标的）→ ≤60s OO gauge
   `mist_realtime_subscription_desired_count` 变化 + converged 恢复；auto_reconcile
   false→true 切换实测；evidence 落盘。

## 8. 风险与回滚

- **定时收敛 reset 每 60s 全量 sync**：标的个位数，协议幂等（桥 diff），
  风险低；HIL 观察首日无异常后可考虑提高周期。
- **toVo 同步读缓存**：缓存由定时轮刷新（≤60s 滞后），切换开关后 VO 展示
  最多滞后一个周期，可接受（与收敛同周期）。
- **回滚**：migration 017 为新增表（回滚=DROP TABLE）；backend 改动
  （allowlist/coordinator/service）需随镜像回滚；env 恢复（部署前备份 .env）。
- **deploy 侧 set-* 脚本改造是破坏性变更**：旧 workflow 引用的脚本签名变化，
  同一批更新 `set-windows-realtime-business-allowlist.yml` 调用参数。
