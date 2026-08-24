# 2026-08-10 生产只读审计 — extract-backtest 1.4

> 采集：Strategy Evaluation Audit run 31350459092（artifact 完整，gate 失败不影响 artifact——
> on 模式零数据 gate 按设计失败）。生产 MySQL（mist-mysql）。

## 1. schema_migrations（真实，001-016 全部 applied）

- 最高：`016_backtest_target_issues_and_pagination_index.sql`（2026-08-05 07:23:04 应用）
- 即 backtest 的 forward-only migration **已上线**（target_issues + pagination index），
  extract-backtest 4.1 的 migration 部分实质已随部署完成。

## 2. backtest 表存量

| 表 | 行数 |
|---|---|
| backtest_runs | **5** |
| backtest_signal_results | **28** |

## 3. backtest_runs 物理列（节选）

id / strategy_definition_id / strategy_version_id / target_universe(json) /
**target_issues(json, DEFAULT_GENERATED json_array())** / period / source(enum ef/tdx/qmt) /
start_date / end_date / status(enum pending/running/completed/failed) / signal_count /
matched_security_count（+后续列略）

## 4. 索引与约束

- backtest_runs：PRIMARY / fk_backtest_runs_definition / idx_backtest_runs_status /
  idx_backtest_runs_strategy_version_id
- backtest_signal_results：idx_backtest_signal_results_run_id /
  **idx_backtest_signal_results_run_time_id**（016 pagination 复合索引，已生效）
- named constraints / FKs 见 audit constraints.tsv / indexes.tsv（artifact 保留）

## 5. 附：发现

- **schema-audit workflow 的 managed-column gate 过期**：`Capture Windows Database Schema Audit`
  run 31350356544 失败于"expected 26 post_migration_ready rows, got 24"——硬编码期望数未随
  QMT 退役列清理更新（deploy 脚本校准项，建议单独修）。
- strategy_signals/strategy_alert_events 今日 7 行（周五 2 行）——QMT 恢复后 on 模式新增
  5 条 signal（strategy=on QMT 评估实证，供下午观察项引用）。
