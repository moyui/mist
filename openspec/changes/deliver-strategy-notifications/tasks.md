## 1. 后置启动门禁与现状审计

- [ ] 1.1 确认 `run-realtime-strategy-evaluation` 已通过 shadow/on 集成门禁并真实产生可消费的 PENDING
  AlertEvent，Signal/context evidence shape 已由 HIL 固定，且项目负责人明确恢复本 change。该项完成前，
  1.2–5.4 全部暂停，不创建 notification 实施 worktree，不修改代码/schema/deploy/monitoring，不申请或
  接入生产渠道凭据；seeded fixture、旧 manual scan 或字段存在只能用于未来开发，不能满足恢复门禁。
- [ ] 1.2 恢复后重新审计 AlertEvent/Signal schema、delivery APIs、stable specs、真实 producer evidence、
  notification worktree 和真实部署状态；不得把当前审计结论视为届时仍然有效。
- [ ] 1.3 建立 AlertEvent → claim → template → channel → result → monitoring/deploy 影响链。

## 2. 渠道与消费语义逐项评审门禁

- [ ] 2.1 向项目负责人评审首批渠道、目标入口、认证、模板和 message evidence。
- [ ] 2.2 比较数据库 claim、queue 和 transactional-outbox 候选，提交并发与 crash-window 矩阵。
- [ ] 2.3 向项目负责人评审 timeout、幂等、retry/backoff、dead-letter、人工重放和部分成功语义。
- [ ] 2.4 向项目负责人评审现有 AlertEvent schema 是否足够及任何 migration/兼容/回滚方案。
- [ ] 2.5 向项目负责人评审 notification worker app、queue/Redis、secrets、health 和 deploy topology。
- [ ] 2.6 将全部接受结论写回 design/specs；未确认前不得实现 worker、schema 或渠道 adapter。

## 3. Notification Core 与 Adapter

- [ ] 3.1 实现接受后的 bounded claim/consume、channel-neutral envelope 和模板 contract。
- [ ] 3.2 实现首批 channel adapter、timeout、redacted logging 和 contract tests。
- [ ] 3.3 实现 delivery result persistence，并保持 operator acknowledgement 独立。
- [ ] 3.4 实现 duplicate/crash/restart/partial failure/reconciliation tests。

## 4. 部署与监控

- [ ] 4.1 实现接受后的 notification worker Compose/env/secrets/health/startup/rollback。
- [ ] 4.2 增加 consumption/claim/latency/channel result/failure 低基数 monitoring。
- [ ] 4.3 证明 notification failure 不改变 strategy persistence、candle 或 transport health。

## 5. 验证与真实渠道 HIL

- [ ] 5.1 运行受影响仓库完整基线、真实 MySQL/queue、strict OpenSpec 和 `git diff --check`。
- [ ] 5.2 使用受控测试接收端验证 dry-run/shadow、duplicate 和 result writeback。
- [ ] 5.3 在凭据脱敏条件下完成首批真实渠道 success/failure/restart HIL。
- [ ] 5.4 向项目负责人逐项审阅 HIL、retry/partial-failure 和 rollback evidence 后才归档。
