# Handoff Prompt：告警链完整性（remediate-alert-delivery-integrity）收盘交接

日期：2026-08-13（周四）收盘后
线程：告警链质量审查 → 修复 → 部署 → 生产验证（全部完成，剩明日开盘 HIL）

---

## 一、本线程已完成（交接基线）

### 1. 质量审查（两份指南全量对照）
- `mist/docs/project-quality-governance-guide.md` + `mist-backend-code-style-guide.md`
- 覆盖策略告警链（deliver-strategy-notifications）+ 日志告警链（O3 add-oo-health-alerts）
- 产出 3 中 5 低 findings → 用户拍板开 change 全修

### 2. change `remediate-alert-delivery-integrity`（openspec 四件套 validate ✓）
| ID | 修复 | 生产实证 |
|----|------|----------|
| M1 | `mist_oo_alert_total` 独立指标（status=sent\|failed × channel），O3 与策略计数完全隔离 | 注册正常，无数据点（盘外无投递，盘内首次触发才有） |
| M2 | `PendingAlertDeliverySweepService`：@nestjs/schedule @Interval(60s)，判据 `PENDING + ≥5min + 无 delivery 行` → enqueueFanout（jobId 幂等）；`mist_notification_sweep_recovered_total` | 🔥 **首跑捞 14 个真实 stranded（08-13 积压）全投递成功 + 幂等** |
| M3 | 共享 `isUniqueConstraintViolation`；fanout 只吞精确 ER_DUP_ENTRY，其他抛 | 单测覆盖 |
| L1 | receiver ts 缺失拒绝（不补当前时间） | 单测 |
| L2 | `StrategyAlertEventVo` + Swagger | 单测 |
| L3 | replay 路径 → `/internal/notification/replay/:id` | 单测 |
| L4 | `SEVERITY_BY_PREFIX` 移 constants + sync 脚本 apply 前校验 + test-*.ps1 断言 + receiver 全 6 键单测 | sync 生产跑通 |
| L5 | `mist_notification_queue_depth` 双 queue label | OO 可查 ✓ |
| 命名 | `updateDeliveryStatus`/`enqueueAlert`/`channelLabel` | 无残留 |

### 3. 提交与部署
- mist：`eb51a300`（worktree feat/remediate-alert-delivery-integrity，已 ff 推 origin/master）
- mist-deploy：`342376a`（11db93a L4 校验 + 342376a O3 遗留 rules/destinations 最终版）
- 部署：`31701001077` **success**（镜像 mist eb51a300 + datasource 141efe2[其他线程 F4-q] + fe ea4632a，F root，productization=shadow，channels=wechat）
- 门禁：169 suites / 1353 tests / openspec 67 / deploy test 全绿
- **tasks 39/40 勾选**（10.4 盘内 HIL 待明日）

---

## 二、明天（2026-08-14 周五）待办

### 1. 开盘后 HIL：O3 盘内投递 + mist_oo_alert_total 首次数据点（tasks 10.4）
验证路径（盘内任意 O3 规则触发时）：
```bash
# ① OO 查询 mist_oo_alert_total（盘内触发后应有 status=sent 数据点）
# 注意：查询体 query 包裹 + start_time/end_time 微秒（UTC now × 1e6）
POST /api/default/_search?type=metrics
{"query":{"sql":"select status, channel, value from mist_oo_alert_total","start_time":<微秒>,"end_time":<微秒>,"from":0,"size":10}}

# ② notification 日志（链路证据）
docker logs mist-notification --since 3h   # 找 "accepted"/"oo alert"/"delivered" 关键行

# ③ OO 规则评估日志（可选）
docker logs mist-openobserve --since 3h    # "Alert notification sent"
```
预期：
- 盘内 P0/P1/P2 触发 → receiver `enqueueAlert`（accepted）→ worker → **独立 WeCom bot（OO_ALERT_WECHAT_WEBHOOK）收到**
- `mist_oo_alert_total{status="sent"}` 序列出现（盘内无触发则无序列=正常，与策略指标同行为）
- 盘外（收盘后）触发被 receiver 丢弃（isTradingSession）——设计如此

### 2. 勾 tasks 10.4 + 归档 change
```bash
cd mist && git mv openspec/changes/remediate-alert-delivery-integrity \
  openspec/changes/archive/2026-08-14-remediate-alert-delivery-integrity
openspec validate --all --strict
# commit + push（⚠️ 推送前先 fetch origin/master，可能有其他线程的新 commit）
```

### 3. 可选：更新 `docs/openspec-gap-inventory.md`
（记忆：gap inventory 另一会话有未提交改动——先看 git status 再动）

---

## 三、坑与注意事项（全部实证过）

1. **OO 查询 API**：`POST /api/default/_search?type=metrics|logs`，body 必须 `{"query":{sql,start_time,end_time,from,size}}`；时间窗微秒；字段在 hit 顶层
2. **OO metrics `value < N` 谓词绕过时间窗口**（引擎 bug，count 和明细路径都中招）——写规则/查询禁 value 谓词
3. **OO SSRF 双层**：发送路径只认 `ZO_SKIP_SSRF_CHECKS`（compose 已设 true，勿回退）
4. **部署参数**：docker_root=`F:\MistDocker`；镜像 tag 必须完整 40 字符 SHA（短 SHA pull not found → 自动回滚）；`realtime_productization_mode=shadow` 保持；部署前先确认 mist CI build 完成（否则 pull not found）
5. **主仓库当前被其他线程 checkout 在 `feat/add-chan-duan-segment`**——推 master 用 `git push origin <branch>:master`，不要在主仓库 checkout/merge（会干扰别人）
6. **其他线程活跃**：tdx amount 修复（87f37d22）+ datasource F4-q（141efe2）已推 master；主仓库工作区有未提交文件（019 migration、change 目录）——**不要动**
7. **sweep 已幂等实证**：投递完的事件不再捞；`mist_notification_sweep_recovered_total` 是进程内计数（重启归零）
8. **OO 规则数据独立于部署**：容器 recreate 后 6 规则完好（OO 持久化在 /data）
9. mist 测试基线 169 suites / 1353 tests（新 spec：sweep 5 + receiver ts + admin 3 + bootstrap 1 + severity 锁）

## 四、相关文件/记忆

- change：`mist/openspec/changes/remediate-alert-delivery-integrity/`（proposal/design/tasks/specs delta）
- 部署 run：`31701001077`（成功）；第一次 `31700436188`（镜像未 build 完失败——教训）
- 记忆：[[remediate-alert-delivery-integrity-landed]] [[oo-alerts-o3-design-parked]] [[deliver-strategy-notifications-audit]] [[openspec-gap-inventory-20260811]]
- OO 规则：`mist-deploy/oo-alerts/rules.json`（A1-A6，severity 映射 A1/A2→P0、A3/A4→P1、A5/A6→P2）
