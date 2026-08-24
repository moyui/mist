# 2026-08-10 lifecycle 6.2 证据汇编

> 6.2：Deploy matched candidate with lifecycle off, initialize/audit assignments, record repository
> SHAs/image tags/terminal bridge paths or platform-unavailable evidence/SHA-256 and verify no
> production mutation or protected-table change。

## 1. 部署与 SHAs/image tags（记录）

- mist `8f3e229`（08-07）/ `6665770`（08-10 OTel）；datasource `68e411bf`（08-05）/`fb38428`（08-10）；
  frontend `990caa40`/`ea4632a0`；deploy `98fdf4c`/`59e3761`。
  来源：`integration-20260806/evidence/2026-08-07-deploy-and-postdeploy-checks.md` +
  `otel-whitebox-20260810/evidence-2026-08-10-o1-o2a-live-test-passed.md`。
- **lifecycle off 阶段部署**：08-05 部署链（candidate 上线时 lifecycle=off）+ **08-06 16:16 部署
  意外 off 期**（env 归一化，08-07 复盘确认）。**时序偏差如实注明**：assignments 初始化（08-05，
  `455fc4e`）早于 08-07 的 on 部署；"先 off 部署→初始化→切 on"的规范序列被 08-06 意外 off 期
  部分覆盖（off 状态真实存在过，证据链完整），08-07 直接以 on 部署（assignments 已就绪）。

## 2. assignments 初始化/审计

- 08-05 建 assignment（3 条：TDX 600519/security1 + 300059/security10 + QMT 300502/security4）+
  清 legacy allowlist（`455fc4e`）。
- 审计：Subscription Lifecycle Audit（08-07 run 31138772138 + 08-10 run 31347656115）
  assignmentReadback：tdx 2 条、qmt 1 条；allowlists 全空（sha e3b0c442…）。

## 3. terminal bridge paths / platform-unavailable evidence

- QMT：platform-unavailable 期（08-07 凌晨 QMT 终端未运行 → `skip_qmt_runtime=true` 部署）+
  08-10 终端恢复（recover v2 smoke 通过，bridge ownerId=bigqmt-17420）。
- TDX：bridge v2.1 + artifact SHA-256 `750cabf9…`（HIL evidence）；08-10 终端异常（无窗口）→
  skip_health_check 部署。
- datasource health/containerIdentities 完整记录（audit artifacts）。

## 4. 无生产变更 / protected-table 零改动

- 部署前后 protected-table digest 6 表 SAME（4a HIL run 31149178628：k=4405、
  k_extensions_ef=0/tdx=4394/qmt=11、strategy_signals/alert_events 前后一致——on 模式写入为
  预期业务行为，非部署变更）。
- 08-10 部署：仅 env 模式 + 镜像 tag 变更，无 migration（016 已于 08-05 应用）。

## 5. 判定

- 6.2 勾选（注明时序偏差：off 阶段=08-05 初始 + 08-06 意外期；assignments 初始化与审计、
  SHAs、bridge 路径/platform-unavailable、digest 不变全部有据）。
