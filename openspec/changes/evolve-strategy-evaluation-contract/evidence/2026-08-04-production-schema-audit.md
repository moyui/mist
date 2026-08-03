# 生产 Strategy Schema 只读审计（2026-08-04）

## 执行身份

- GitHub Actions run：`mist-trade/mist-deploy#30833811747`
- Workflow：`Capture Windows Strategy Evaluation Audit`
- 生产保护：`environment: mist-production`
- Windows runner：`[self-hosted, windows, mist-api]`
- 审计实现：`mist-deploy@4ef3c89`
- 捕获时间：`2026-08-03T16:48:43.0309848Z`（北京时间 2026-08-04）
- MySQL container：`mist-mysql`

本次只执行固定 `SELECT` 与 `SHOW CREATE TABLE`。没有运行 migration、DDL、DML、备份恢复或
服务重启。workflow 成功，artifact `strategy-evaluation-audit-30833811747` 已下载并固定在同名
evidence 子目录。

## 审计结论

| 项目 | 结论 | 证据 |
| --- | --- | --- |
| migration ledger | 生产已应用 `001`–`013`，与本分支仓库一致 | `schemaMigrations.tsv` |
| 候选下一编号 | `014` 当前未占用 | ledger 与 `deploy/database/migrations` 对照 |
| 六张目标表 | 全部存在 | `tableInventory.tsv` |
| strategy definitions | 0 行 | `rowCounts.tsv` |
| strategy versions | 0 行 | `rowCounts.tsv` |
| live signals | 0 行 | `rowCounts.tsv` |
| AlertEvents | 0 行 | `rowCounts.tsv` |
| backtest runs | 0 行 | `rowCounts.tsv` |
| backtest signal results | 0 行 | `rowCounts.tsv` |
| column/index/constraint inventory | 已捕获 | `columns.tsv`、`indexes.tsv`、`constraints.tsv` |
| exact physical DDL | 已捕获六张表的 `SHOW CREATE TABLE` | `showCreateTables.tsv` |

零存量假设已被真实生产证据确认，且未发现 migration 编号冲突。因此 task 1.3 完成，可以进入
候选 `014` 的逐项设计评审，但该事实本身不授权执行 migration。

## 与目标契约的差异

1. `strategy_versions` 当前没有 `signal_kind`；目标为
   `enum('entry','exit') NOT NULL` 且无数据库 default。
2. `strategy_signals` 当前使用 `security_code varchar(20) NOT NULL`；目标删除该列，改为
   canonical `security_id int NOT NULL`。
3. `strategy_signals` 当前没有 `signal_kind`；目标为
   `enum('entry','exit') NOT NULL` 且无数据库 default。
4. `idx_strategy_signals_security_time` 当前索引 `(security_code, signal_time)`，目标需要改为
   `(security_id, signal_time)`。
5. `strategy_signals` 当前没有到 `securities(id)` 的 security FK；是否新增及其 named constraint
   必须随候选 `014` 一起确认。
6. `strategy_signals` 当前没有 composite unique，目标继续不增加；AlertEvent 继续复用
   `uq_strategy_alert_events_dedupe_key`。
7. `backtest_signal_results.security_code` 及其既有幂等唯一键不属于本次 live Signal identity 改造，
   保持不变。

## 仍未解除的门禁

- TDX/QMT A 股 `volume=股`、`amount=人民币元` 的 source quantity profile 尚未在本 change 中固定
  交易时段 HIL；在该证据完成前，引用量额字段的策略不得进入 realtime eligible 状态。
- 项目负责人已于 2026-08-04 确认拆分门禁：schema/API 按零存量路径推进，quantity realtime
  eligibility 独立锁在 HIL 门禁后。
- 同次确认 `fk_strategy_signals_security` 使用 `ON DELETE RESTRICT ON UPDATE RESTRICT`。
- 因此 task 1.4 完成；后续 migration 仍必须在执行时重新验证六表零行和精确 schema state。

## Repository evidence SHA-256

GitHub artifact 的 JSON 文本在纳入 Git 仓库时统一为 LF；以下摘要对应仓库中的 evidence copy。

```text
9a69618870bb62667cc5d3595ce98524a677add748f57fe5a5ee016b70aa3a1f  columns.tsv
e4c05f38d6ef8cd33e55490d8870ff2a725a3b0e43201370f095a6964e133a08  constraints.tsv
e53eaf874561ac2f6fb9972f0965759a22b47ba5d6ef93f4e502a23141a49996  indexes.tsv
ed475051e65040392b14989a0b57fb4ff8075d4e51b5b8edbeaaa3b33920242f  manifest.json
e9c9fe161bd1ddface111791036c4f883267d03ad2d4803b47b041d9b8847f36  rowCounts.tsv
2c67f854a19339b5f6f642584ac358cd4387c0e524f3ffedf634b7ae6fee2585  schemaMigrations.tsv
7baee9f6bece9824b87c93789bc1e4f7528841156b1545cb0528cd1ced1b2cb6  showCreateTables.tsv
0c02d54eecc769c6e7a686a7b8767d5c33361a5f032caa639f187192764279c9  tableInventory.tsv
```
