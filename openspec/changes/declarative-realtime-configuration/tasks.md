# Tasks: declarative-realtime-configuration

> 状态约定：本 change 三层（配置层 / 协调层 / 状态层），改动在 mist 仓（backend）
> 与 mist-deploy 仓（migration/脚本/workflow）。spec 确认后写实施计划（代码级），
> 再落地。

## 1. 配置层（mist 仓 + deploy 仓 migration）

- [x] 1.1 migration 016：建 `runtime_configs` 表（config_key PK / config_value /
      updated_at / updated_by / comment）（D1）。
- [x] 1.2 迁移脚本：初始行**直接写 'true'**（生产现状 lifecycle=on，不推断
      不渐进）；幂等（已存在不覆盖）；随部署一次性完成，无渐进迁移期
      （D1/D8）。
- [x] 1.3 backend 新增 runtime_configs 读取（启动时 + 可重读接口，供协调层
      每轮调用）（D1）。
- [x] 1.4 allowlist service：删 env 解析路径（parse() env 分支），initialize
      统一从 DB 读；删 validation.schema.ts Joi 互斥校验（D2）。
- [x] 1.5 allowlist service 单测更新：DB 唯一来源、无 env 路径、resolveExact
      保留。

## 2. 协调层（mist 仓）

- [x] 2.1 coordinator 删 mode 分支（isEnabled/onModuleInit 提前 return）；
      事件订阅恒挂载（修启动 off 死锁）（D3）。
- [x] 2.2 删 refreshDesiredState→applyAssignedRoutes 对 allowlist service
      的覆盖；effectiveEntries 改收敛成功后显式回调（或独立周期读，
      实施计划定）（D3）。
- [x] 2.3 新增 @Interval 定时 reconcile（默认 60s，env 可配
      REALTIME_RECONCILE_INTERVAL_MS）；每轮重读 auto_reconcile，true 收敛 /
      false 跳过（不撤销现有订阅）（D4）。
- [x] 2.4 开关迁移逻辑 `applyAutoReconcileChange`：false→true 挂载 + 全量
      收敛；true→false 停止收敛保留订阅；修 handleAcceptedReady 不查 mode
      的不对称（D4）。
- [x] 2.5 协调层单测：定时收敛、开关迁移、无 mode 分支、收敛成功回调。

## 3. 状态层（mist 仓）

- [x] 3.1 新增 subscription-lifecycle-metrics.ts：8 个收敛状态 gauge +
      2 个 allowlist 状态 gauge（清单见 design D5），main.ts 挂载（D5）。
- [x] 3.2 ObservationStore.health() 补生产调用（gauge 回调）；allowlist
      list/计数接入（D5）。
- [x] 3.3 单测：gauge 注册与回调值、低基数约束（symbol 不作 label 护栏）。

## 4. 写通道（deploy 仓）

- [x] 4.1 set-realtime-business-allowlist.ps1 改造为 DB 直写版本：保留 5 只
      上限/格式/去重/probe.cjs 精确匹配校验；事务写 assignments + 审计记录
      （updated_by='ops:ssh'、comment、旧值备份）（D6）。
- [x] 4.2 set-realtime-subscription-lifecycle-mode.ps1 退役（auto_reconcile
      写入 runtime_configs 命令化进 runbook）（D6）。
- [x] 4.3 set-tdx-allowlist-stress.yml 退役（Change 2 已登记，本 change 执行
      删除）（D6）。
- [x] 4.4 校验：ssh 通道端到端（改 allowlist → 定时收敛 → OO gauge 可见）。

## 5. deploy 清理（deploy 仓）

- [x] 5.1 .env / compose / .env.example 退役 TDX_REALTIME_ALLOWLIST、
      QMT_REALTIME_ALLOWLIST、REALTIME_SUBSCRIPTION_LIFECYCLE_MODE（D7）。
- [x] 5.2 7 处 TODO(shrink) readback 段处置：set-realtime-business-allowlist
      readback 改 OO/DB 验证；health-check throw 段改 OO/DB 检查；run-*.ps1
      注释清理；test-*.ps1 断言更新（D7）。
- [x] 5.3 runbook 增"写配置"章节（一条 ssh 命令改 allowlist/开关 + 校验 +
      审计）（D7）。

## 6. 验证

- [x] 6.1 mist 仓：`pnpm run lint:check && pnpm run typecheck && env TZ=UTC
      pnpm run test:ci` 全绿。
- [x] 6.2 deploy 仓：`test-*.ps1` 门禁全绿（含 migration/脚本断言）。
- [x] 6.3 `openspec validate declarative-realtime-configuration --strict`。
- [ ] 6.4 生产 HIL（实盘线程/交易时段）：改 DB assignments（ssh 通道）→
      ≤60s 自动收敛（OO gauge converged 变化）→ 免重启；auto_reconcile
      false→true 迁移验证；evidence 落盘。

## 7. 提交（三步工作流）

- [x] 7.1 spec 确认通过后写实施计划（代码级）。
- [x] 7.2 实施计划确认后落地（worktree 分支 + 单测 + 验证 + 合并）。
- [ ] 7.3 归档（delta 合并进 live specs 手动同步）。
