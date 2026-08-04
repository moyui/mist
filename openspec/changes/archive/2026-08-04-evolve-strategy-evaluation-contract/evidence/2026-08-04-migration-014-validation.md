# Migration 014 隔离 MySQL 验证（2026-08-04）

## 验证范围

- 分支：`feat/evolve-strategy-evaluation-contract`
- 被验证提交：`000610e fix(database): fail closed without prepared signal`
- GitHub Actions run：`mist-trade/mist#30838073557`
- Job：`Verify migration 014 on MySQL 8.4`
- 数据库：隔离的 `mysql:8.4` service container
- migration SHA-256：
  `57380491705224069516a32efcd8b7a9079d40fd0a6fe6cd0c34d18ab602e2af`

本次只在 CI 临时数据库验证候选 migration。**没有在生产 MySQL 执行 migration 014，也没有修改
生产数据或服务。**

## 通过项

| 场景 | 结果 | 固定的契约 |
| --- | --- | --- |
| `001`–`014` 全顺序执行 | 通过 | 最终 columns、indexes、named FK、enum 与 ORM metadata 一致 |
| 已知半完成状态重跑 `014` | 通过 | `strategy_versions` 已完成而 `strategy_signals` 仍为旧结构时可 repair-forward |
| 六张目标表存在非零数据 | 按预期失败 | migration 执行时重新 fail-closed，不依赖旧的生产审计快照 |
| 删除被 Signal 引用的 Security | 按预期受阻 | `fk_strategy_signals_security` 使用 `ON DELETE RESTRICT` |
| 更新被 Signal 引用的 Security id | 按预期受阻 | `fk_strategy_signals_security` 使用 `ON UPDATE RESTRICT` |
| schema readback | 通过 | `signal_kind` 非空且无 default；Signal 使用 `security_id`；无 Signal composite unique |

## 首次失败与修正

首次 run `30837912330` 的全顺序和 repair-forward 场景已通过，但“目标表非零时拒绝”分支使用了
动态 prepared `SIGNAL`。MySQL 8.4 返回 `ER_UNSUPPORTED_PS`，原因是该语句不支持 prepared
statement protocol，而不是业务 schema 不满足。

修正后，动态分支通过读取一个语义明确且必定不存在的 sentinel table 产生数据库错误；执行器仍会
立即停止，且不会进入任何 DDL。静态测试同时禁止 migration 恢复 prepared `SIGNAL`。修复后的
run `30838073557` 全部通过。

## 结论与剩余门禁

- tasks 3.1、3.2 的 migration、readback、repair-forward、ORM/raw SQL/schema audit 与 named
  constraint 交付已完成。
- migration 014 已加入不可变 migration digest 测试；后续修改该文件会直接使测试失败。
- schema/API 代码可以继续开发，但 production migration 仍须随匹配的 backend/frontend 版本、备份和
  发布门禁执行。
- TDX/QMT quantity source profile 的交易时段 HIL 仍未完成；引用 `k.volume` 或 `k.amount` 的策略
  在该门禁完成前不得标记为 realtime eligible。
