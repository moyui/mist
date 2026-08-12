# Design: declarative-realtime-configuration

## 决策点

### D1：runtime_configs 表结构与迁移
- 新表 `runtime_configs`（migration 016，deploy/database/migrations 惯例）：
  - `config_key` VARCHAR PK、`config_value` VARCHAR、`updated_at` DATETIME、
    `updated_by` VARCHAR（审计：操作来源，如 'ops:ssh'）、`comment` VARCHAR。
  - 首项：`config_key='realtime_subscription_auto_reconcile'`，
    `config_value IN ('true','false')`。
- **迁移（D8，一把梭——用户拍板 2026-08-11，无渐进迁移期）**：随部署一次性
  完成——migration 建表 + 初始行**直接写 'true'**（生产现状 lifecycle=on，
  不推断、不设保守默认）；backend 新代码读 DB 与 env 退役同一批部署完成。
- 读取：backend 启动时读 + 协调层每轮定时重读（与 reconcile 同周期）——
  运行中改 DB 免重启生效。

### D2：allowlist service 改造——唯一来源 DB
- 删 `parse()` env 解析路径与 `TDX/QMT_REALTIME_ALLOWLIST` 读取
  （allowlist.service.ts:159-175）；`initialize()` 统一从 DB 读
  （assignments ⋈ securities ⋈ security_source_configs，沿用现有
  `resolveExact` DB 校验）。
- 删除 `libs/config/src/validation.schema.ts:247-257` 的 Joi 互斥校验
  （env 不再存在）；`.env` 变量退役（deploy D7）。
- **off（auto_reconcile=false）语义**：allowlist 仍从 DB 读——DB 是唯一
  权威（用户拍板"把 allowlist 也做到 db 里面"）；auto_reconcile=false 只是
  "协调层不自动收敛"，DB assignments 作为期望记录（手动管理场景）。
- `replaceAssigned` 通道保留给写路径（activate/deactivate security）显式
  使用，不再被协调层隐式覆盖（D3）。

### D3：coordinator 瘦身——只做收敛
- 删 `isEnabled()`/mode 分支（coordinator.ts:165-169 等）；`onModuleInit`
  不再按 mode 提前 return——事件订阅**恒挂载**（修启动 off 死锁不对称）。
- 删 `refreshDesiredState`→`applyAssignedRoutes` 对 allowlist service
  assignedEntries 的覆盖——**协调层与 allowlist 授权解耦**：coordinator
  只做 subscribe/unsubscribe 收敛下发；allowlist effectiveEntries 由协调
  层收敛成功后显式回调更新（`replaceEffective`）或由 allowlist service 独立
  周期读 DB（实施计划阶段二选一，倾向显式回调：事实唯一化）。
- `handleAcceptedReady`/`enqueue` 不再有"on→off 仍触发"的不一致
  （mode 分支删除后行为统一为"收到就绪即收敛"，是否收敛由
  auto_reconcile 在调度层统一闸门控制）。

### D4：定时收敛 + 开关迁移逻辑（纯声明式）
- 新增 `@Interval` 定时 reconcile（周期默认 60s，env 可配
  `REALTIME_RECONCILE_INTERVAL_MS`）；每轮：重读 `auto_reconcile` →
  true 则执行收敛（直读 DB desired → 下发差异 subscribe/unsubscribe）；
  false 则跳过收敛（**不主动撤销现有订阅**——off 是"不自动管理"，
  已有订阅保留，手动接管）。
- **开关迁移逻辑**（集中在一个方法 `applyAutoReconcileChange(before, after)`）：
  - false→true：若事件订阅未挂载则挂载 + 立即全量收敛（对齐 DB 期望）；
  - true→false：停止周期收敛，现有订阅保留（手动接管语义）。
- 与现有触发共存：09:15 cron、连接就绪事件、activate/deactivate 写路径
  仍保留（都受 auto_reconcile 闸门约束）。
- **零新增写端点**（用户拍板）：改配置 = 写 DB（OpenSSH 通道），收敛 = 定时
  自动，无 HTTP 控制面。

### D5：状态层 OTel gauge 导出（诊断走 OO）
- 新增 `realtime/observability/subscription-lifecycle-metrics.ts`（仿
  candle-metrics.ts 的 observable gauge 模式，main.ts 挂载）：
  - `mist_realtime_subscription_desired_count{source}`、
    `mist_realtime_subscription_active_count{source}`、
    `mist_realtime_subscription_converged_count{source}`、
    `mist_realtime_subscription_deferred_removal_count{source}`、
    `mist_realtime_subscription_trigger_total{source,trigger}`、
    `mist_realtime_subscription_result_total{source,result}`、
    `mist_realtime_subscription_last_attempt_age_seconds{source}`、
    `mist_realtime_subscription_last_success_age_seconds{source}`；
  - allowlist 状态：`mist_realtime_allowlist_assigned_total{source}` +
    `mist_realtime_allowlist_effective_total{source}`。
- 低基数约束：source（tdx|qmt）+ trigger/result 有界枚举；**symbol 不作
  label**（沿用 live spec "Metric labels are low cardinality"）。
- 数据源：`ObservationStore.health()`（现零消费者，补生产调用）+ allowlist
  service 的 list/计数。
- 边界：不恢复被 shrink 删除的 HTTP 诊断端点（b10110b）；deploy 侧 7 处
  `TODO(shrink)` readback 段由 OO 查询替代（D7）。

### D6：写通道——OpenSSH + docker exec（保留校验 + 审计）
- deploy 仓：`set-realtime-business-allowlist.ps1` 改造为 **DB 直写版本**
  （不再改 .env + force-recreate）：
  - 保留既有校验：5 只上限、格式正则、去重、DB 精确匹配
    （`realtime-business-allowlist-db-probe.cjs` 校验逻辑复用）；
  - 写 assignments（INSERT/UPDATE/DELETE 事务）+ 写 `runtime_configs` 审计
    记录（updated_by='ops:ssh'、comment=变更说明、变更前旧值备份）；
  - 执行通道：macOS `ssh mist-box "powershell -File ..."`（Change 2 通道），
    docker exec 进 mist-backend 容器跑 mysql 客户端（或独立 mysql 容器访问）。
- `set-realtime-subscription-lifecycle-mode.ps1` **退役**（auto_reconcile
  写入 runtime_configs 一条 SQL + 审计即可，runbook 命令化）。
- `set-tdx-allowlist-stress.yml` **退役**（其"绕过 5 只上限"能力不保留——
  校验是写通道强制项）。

### D7：deploy 清理
- `.env`：退役 `TDX_REALTIME_ALLOWLIST` / `QMT_REALTIME_ALLOWLIST` /
  `REALTIME_SUBSCRIPTION_LIFECYCLE_MODE`（compose env 传递移除）；
  `.env.example` 同步。
- 7 处 `TODO(shrink)` readback 段处置：`set-realtime-business-allowlist.ps1`
  L119-122 readback 改 OO 查询验证（或 DB 直查 assignments）；
  `health-check-docker-appliance.ps1` L379-384 的 "endpoint removed" throw 段
  改 OO/DB 检查；`run-*.ps1` 系列注释段清理；`test-*.ps1` 对应断言更新。
- 验证脚本/文档更新：runbook 增加"写配置"章节（一条 ssh 命令改
  allowlist/开关 + 校验 + 审计）。

### D8：迁移与兼容（一把梭）
- **一把梭（用户拍板 2026-08-11）**：同一批部署完成全部切换——
  migration 016 建表 + 初始行写 'true'（生产现状 on，写死不推断）→
  backend 新代码读 DB → env 退役。**无渐进迁移期**（不保留"无 env 默认
  false"的保守逻辑，不为 off 场景设过渡态）。
- 行为兼容：生产 on→true 等价，一次切换；auto_reconcile=false 是显式
  手动管理选择，不再是迁移中间态。
- 回滚：runtime_configs 为新增表，回滚=删表 + env 恢复（deploy 侧备份
  .env 现值）。

## 影响链（producer → wire → decoder → state → consumer → deploy/monitoring）

- **producer**：写通道（ssh + docker exec SQL）→ runtime_configs +
  assignments（DB）。
- **state**：backend 读 DB（启动 + 每轮）→ coordinator 收敛 →
  allowlist effective（回调更新）；无 env 依赖。
- **consumer**：datasource 订阅协议不变（subscribe/unsubscribe 消息面不改）。
- **deploy**：migration 016；.env 退役；set-* 脚本改造/退役；runbook。
- **monitoring**：状态层 gauge → OO 查询（诊断走 OO）；readback 段替代。

## 长期维护成本

- 配置模型单一（DB 唯一权威）：无 env/DB 双轨心智负担；运维操作统一
  "ssh + SQL + 校验脚本"。
- coordinator 瘦身后职责单一（收敛），mode 分支删除减少行为分支面；
  定时收敛是唯一新增运行时组件（60s 周期，负载可忽略）。
- 状态层 gauge 与 candle-metrics.ts 同模式，无新抽象。
- 风险点：auto_reconcile=false 的"保留现有订阅"语义需 runbook 明确
  （手动接管时不与协调层抢控制）。
