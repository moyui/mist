# 2026-08-10 OTel O1/O2a 实盘测试 — 生产验证 PASSED

> 执行：08-10 上午（09:08-10:06 CST）。对应 handoff `handoff-prompts-otel-o1-o2a-20260810.md` 步骤 1。
> 结论：**O1 candle pipeline 埋点生产验证通过**（spans + gauges 全链路入库）。

## 1. 前置修复（今日完成）

| 问题 | 根因 | 处置 |
|---|---|---|
| TDX 终端无窗口 | recover 重拉后无可见窗口（自动化分类失败 manual_action_required） | 待用户手动登录（未恢复） |
| QMT 数据流不通 | **盒子 .env `QMT_REALTIME_MODE=off`**（周末线程遗留）→ datasource 未挂 subscription controller（/health `subscriptions` 走 fallback `{"ready":false}`，main.py:169）→ backend transport_not_ready | `Set Windows Realtime Mode` source=qmt mode=**builtin**（09:52）→ **数据流恢复**（lastQuoteAt 3s 内、wholeHandleCount=1、get_subscriptions success） |
| QMT stale observation | 周五消费失败残留 | 新增 workflow `clear-windows-qmt-context-observation.yml`（deploy 7e89345→03c000a）：clear-observation / reset-journal（journal 家族备份移动）——实际修复后未再需要（journal 备份保留） |
| productization=off | 08-10 部署输入 false 归一化（schema 缓存老问题）→ **off 模式 ingest_gated（product.service:182）跳过聚合**：snapshot.process spans 有、sealed/due.finalize 无、sealed gauge=0 | 部署重跑传 shadow + **skip_health_check=true**（TDX 17709 探测因终端坏失败，周五已知 workaround）+ 完整 previous SHA（首次失败因短 SHA 导致回滚 compose 失败）→ 成功（10:02）→ Set lifecycle=on（10:04） |

## 2. 验证结果（OO 查询，10:06）

| 项 | 值 | 判定 |
|---|---|---|
| `candle.snapshot.process` | 160（30min 窗口） | ✅ 每帧一 span |
| **`candle.due.finalize`** | **6** | ✅ off 模式不出现，shadow 后出现 |
| `mist_candle_sealed_total` | **1.0（非零，增长）** | ✅ 桶真实封存 |
| 运行时指标 | nodejs/v8js runtime（preload 生效） | ✅ |
| QMT 数据 | lastQuoteAt 持续、leaderClientId=mist-backend-qmt | ✅ |

## 3. 关键经验（交接文档补充）

- **productization=off 下 O1 部分验证不可行**：`ingest_gated reason=mode_off`（product.service.ts:182）——
  snapshot.process spans 照发（ingress 层）但聚合/封存/指标全停。**sealed/discard gauge 与
  due.finalize span 的验证必须 shadow/on**。handoff 中"off 符合预期"与步骤 1 期望 sealed 非零
  矛盾——以本证据为准：实盘测试用 shadow。
- **QMT_REALTIME_MODE 是独立 env**（Set Windows Realtime Mode workflow 管理，deploy 不覆盖）——
  周末线程若动过需记得切回 builtin。
- TDX 17709 探测在终端异常时会挂部署 → skip_health_check（有 TDX 终端问题时）。
- previous_image_tag 必须完整 40 位（短 SHA 使自动回滚 compose 失败，产生误导性 :260 throw）。

## 4. 待办

- TDX 终端手动登录后：TDX 数据恢复 → 双源 spans 观察。
- 首日观察（handoff 步骤 2）：交易时段 spans 数量/指标趋势持续监控。
- strategy=on 保持：QMT 数据恢复后策略评估将真实写库（预期行为）。
