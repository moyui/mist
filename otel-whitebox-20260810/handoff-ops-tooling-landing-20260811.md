# 交接 — 运维能力改造落地（3 个 change，代码已合，待生产验证）

> 来源：2026-08-11 主线程（响应 `handoff-prompts-ops-http-tooling.md`）。
> 目标：把"运维只能靠 workflow 触发脚本"的模式改为 **日志进 OO + OpenSSH 通道 +
> 声明式配置**。三个 change 的 spec→实施计划→落地全程按三步工作流断开确认。
> **本文档自包含**：接手者无需读对话历史，按 §3 checklist 跑生产验证即可。

---

## 一、背景与动机（一句话链路）

2026-08-11 TDX 四层故障排查暴露：**Windows 盒子无 SSH → 一切运维只能 workflow
触发（30s-2min/轮）；datasource 日志不进 OO 只能 docker logs 挖；allowlist 变更
=改 .env+重启；诊断状态零可见**。三个 change 按讨论定案方向：

- **诊断读状态** → OTel 补齐（**不恢复** shrink 删的 HTTP 端点）
- **控制类写操作** → 声明式配置 + 控制面触发重载（k8s 惯例，零新写端点）
- **宿主级操作** → Windows OpenSSH 通道
- **mode 概念拆分**：lifecycle 承载过多能力（开关+权威+收敛+诊断）拆三层
- **allowlist env 彻底退役**：唯一来源 DB
- **一把梭迁移**：无渐进迁移期（生产 lifecycle=on → 直接写 'true'）

---

## 二、已落地（提交清单 + 验证状态）

### Change 1：`datasource-logs-to-openobserve`（O2b）

| 仓库 | 提交 | 内容 |
|---|---|---|
| mist-datasource | `3ded4e6`（已推 origin/master） | `src/core/otel.py` + `logging.py` + `conftest.py` + `test_otel*.py` + `test_logging_trace.py` + `mock-verify.sh`（7 文件） |
| mist | `2090c62`（已推） | spec 五件套 + `docs/otel-observability-queries.md` datasource 段 |
| mist | `aa2e85c`（已推） | tasks 勾选（14/18 项已勾） |

**实现要点**：`init_otel` 尾部挂 `LoggerProvider + BatchLogRecordProcessor + OTLPLogExporter + LoggingHandler`（**零新依赖**：sdk 内含、otlp-proto-http 内含 OTLPLogExporter）；保留 stdout（docker logs 兜底）；OO 内单发；`force_flush` 含 logs；`TraceContextFormatter` trace_id 16→32 hex；no-op guard + 幂等；**compose 零改动**（复用现有 endpoint/headers，logs 派生 `/v1/logs`）。

**本地验证**：`514 passed`（4 个失败 = master 基线一致，QMT 9004 端口环境阻塞）+ ruff 通过 + `openspec validate --strict` 通过。

### Change 2：`windows-openssh-ops-channel`

| 仓库 | 提交 | 内容 |
|---|---|---|
| mist-deploy | `830152c`（已推 origin/master） | `enable-windows-openssh.ps1` + workflow + test + runbook；退役 inspect-port/update-bridge-script 2 个 workflow；dump 降级标注 |
| mist | `195886f`（已推） | implementation-plan |

**本地验证**：CI 静态门禁（test-enable-windows-openssh）通过 + compose-config/defaults 通过 + `openspec validate --strict` 通过。

### Change 3：`declarative-realtime-configuration`（最大）

| 仓库 | 提交 | 内容 |
|---|---|---|
| mist | `537119c`（已推 origin/master） | 三层重构（配置/协调/状态）+ migration 017 + 实体 + RuntimeConfigService + allowlist 改造 + coordinator 瘦身/定时收敛 + 10 gauge + toVo 缓存 + 测试 |
| mist-deploy | `8a149f9`（已推 origin/master） | `write-realtime-business-allowlist.cjs` + ps1 DB 直写改造 + 退役 lifecycle-mode/stress + .env/compose/workflow 清理 + 7 处 TODO(shrink) 处置 + runbook |
| mist | `aa2e85c`（已推） | tasks 勾选（25/29 项已勾） |

**本地验证**：mist `lint:check + typecheck + test:ci 1244 passed + ci:contracts` 全绿；deploy 12 个门禁测试全过；`openspec validate --strict` 通过。

---

## 三、生产 HIL 待办（接手 checklist，按 change 分）

> 全部在交易时段/盒子就绪后执行；每步给【动作 + 命令 + 预期 + 失败排查】。

### Change 1 — datasource 日志进 OO

```
[ ] 1.1 mock 栈验证（Change 1 tasks 3.2，无需盒子）
    动作：tools/mock-env/mock-verify.sh
    预期：§5 "querying tdx-datasource logs" 返回 ≥1 条 + dedup check OK
    失败：OO logs 流未收到 → 检查 OTEL_EXPORTER_OTLP_ENDPOINT 含 /api/default；
          单发计数 >1 → 检查是否误加 mixin/第二 handler（gaps cnt=2 教训）

[ ] 1.2 部署（datasource 镜像 build + mist-deploy 部署）
    部署链：datasource master 3ded4e6 → 镜像 → mist-deploy 部署 datasource 容器
    无需 migration（纯代码）

[ ] 1.3 生产 OO 验证（交易时段）
    查询：POST http://192.168.31.182:5080/api/default/_search?type=logs
    SQL: select * from 'default' where service_name='tdx-datasource' order by _timestamp desc limit 10
    预期：观测帧/ingest 日志可见；LogRecord.trace_id 顶层字段；按 trace_id 查恰好 1 条（单发）
    QMT 侧待 QMT 数据流恢复后补

[ ] 1.4 evidence 落盘
    openspec/changes/datasource-logs-to-openobserve/evidence/20260811-tdx-logs-oo.md
    （查询语句 + 结果摘要，参照 O1/O2a 证据格式）

[ ] 1.5 归档（tasks 6.3）
    openspec changes/datasource-logs-to-openobserve → archive/2026-08-XX-datasource-logs-to-openobserve
    delta 合并进 live specs 手动同步（datasource-log-access 新子 spec + datasource-bridge-ingest-observability R2 修改）
```

### Change 2 — OpenSSH 通道

```
[x] 2.1 前置验证（tasks 1.0，已完成 2026-08-12）
    runner 管理员权限：✅（enable workflow 成功执行 Add-WindowsCapability）
    网络可达：✅ macOS `nc -vz 192.168.31.182 22` succeeded（22 已开）

[x] 2.2 启用（tasks 1.2，已完成）
    触发 workflow：enable-windows-openssh（run 31529973803）
    输出：sshd running、firewall rule TCP22 仅 192.168.31.0/24、PasswordAuthentication no

[x] 2.3 密钥分发（tasks 1.3，已完成 2026-08-12）
    macOS：ssh-keygen -t ed25519 -f ~/.ssh/mist_ops_ed25519（已生成）
    经 distribute-windows-openssh-key workflow（run 31551799125）装入
    C:\ProgramData\ssh\administrators_authorized_keys + ACL（SYSTEM+Administrators）
    sshd restart
    **登录用户名 = 12705**（Administrators 组成员；盒子的 macOS 用户名 moyui 不存在）

[x] 2.4 端到端实测（tasks 1.4/5.1，已完成）
    macOS ~/.ssh/config Host mist-box（HostName 192.168.31.182 + User 12705 + IdentityFile）
    `ssh mist-box "whoami"` → `desktop-t3b1o2j\12705` / `DESKTOP-T3B1O2J` ✅
    密码登录：sshd_config PasswordAuthentication no（key-only）

[ ] 2.4 端到端实测（tasks 1.4/5.1）
    macOS ~/.ssh/config 加 Host mist-box（HostName 192.168.31.182 + IdentityFile）
    ssh mist-box "echo ok" → 成功
    密码登录测试 → 必须被拒（PasswordAuthentication no）
    nc -vz 192.168.31.182 22 → 内网可达

[ ] 2.5 退役 workflow 核对（tasks 3.x）
    确认 inspect-windows-port.yml / update-windows-tdx-bridge-script.yml 已从 master 删除
    本地命令复现：端口检查 / 终端脚本更新（runbook §3）

[ ] 2.6 evidence + 归档（tasks 5.3/6.3）
```

### Change 3 — 声明式配置（最关键，部署顺序敏感）

```
[ ] 3.1 部署（顺序！一把梭，tasks 1.2）
    ① mist 镜像 build（master 537119c）→ 部署 candidate（mist-migrate 会自动跑 017）
       migration 017 建表 + 初始行 'true'（生产 on 等价）
    ② 同一批：mist-deploy .env 清理（master 8a149f9，删 TDX/QMT_REALTIME_ALLOWLIST +
       REALTIME_SUBSCRIPTION_LIFECYCLE_MODE；compose env 传递也删）
    ③ backend 新镜像启动 → coordinator 首轮 refresh 读到 'true' → 自动收敛
    注意：若 ②③ 不同一批，部署后 backend 读不到 env 不影响（runtime_configs 已有初始行）

[ ] 3.2 HIL：allowlist 变更免重启（tasks 6.4，核心验证）
    ssh 改 DB：ssh mist-box + set-realtime-business-allowlist.ps1 -TdxSymbols '600030.SH,600519.SH'
              （+1 或 -1 标的；脚本输出 before/after/added/removed 变更清单）
    预期：≤60s OO gauge mist_realtime_subscription_converged_count / _active_count 变化
          convergence 恢复；backend 不重启（docker ps 看 mist-backend uptime 不变）
    失败：变更未生效 → 查 mist_realtime_subscription_desired_count 是否变化（DB 读到了？）
          不收敛 → 查 mist_realtime_subscription_last_attempt_age_seconds（定时轮在跑？）
                  查 mist_realtime_subscription_last_success_age_seconds（成功过？）

[ ] 3.3 HIL：auto_reconcile 开关切换（tasks 6.4）
    false→true：UPDATE runtime_configs SET config_value='false' WHERE config_key='realtime_subscription_auto_reconcile'
              → 等一轮（60s）→ 再 UPDATE 'true'
              → 预期：立即触发全量对齐（OO gauge active_count 恢复）
    true→false：UPDATE 'false' → 预期：停止收敛，现有订阅保留（active_count 不变）

[ ] 3.4 evidence + 归档（tasks 6.4/7.3）
    openspec/changes/declarative-realtime-configuration/evidence/20260811-*.md
    归档：两个 capability delta（declarative-realtime-configuration +
          mist-observability/realtime-lifecycle-observability）合并进 live specs
```

---

## 四、关键设计决策（接手者必读，理解为何这么设计）

| # | 决策 | 理由 |
|---|---|---|
| 诊断不恢复 HTTP 端点 | OTel 补齐 | shrink 删端点是架构决策（白盒交 OTel），重建=推翻；OO 5080 本身已是 macOS 查询入口 |
| 控制类零新写端点 | 纯声明式定时收敛 | 低频写操作，k8s/nginx 惯例；HTTP 写端点要重建鉴权/校验/回滚，风险面大 |
| 定时收敛用 reset 策略 | syncSubscriptions 全量对齐 | control 无单独 unsubscribe；reset 全量协议天然覆盖增/删；60s×个位数标的无开销 |
| allowlist env 彻底退役 | DB 唯一权威 | off 模式 env 被静默覆盖是怪癖；用户拍板"allowlist 也 DB"消除双轨 |
| 一把梭迁移（不渐进） | 初始行直接 'true' | 个人项目，生产 lifecycle=on 状态明确；不为 off 场景设迁移中间态 |
| RuntimeConfigService 内存缓存 | toVo 同步读缓存 | toVo 同步方法，DB 异步；缓存≤60s 滞后（与收敛同周期）可接受 |
| 保留 stdout（datasource 日志） | docker logs 兜底 | no-op 模式下 stdout 是唯一出口；OO 链路故障时（有先例）docker logs 是最后防线 |

---

## 五、已知风险与坑（落地中发现的，务必留意）

1. **Change 1：OTel 1.44 标记 `LoggingHandler` deprecated**（官方建议 instrumentation-logging）——功能完全正常，零新依赖路线不变；**升级 OTel 时回归测试锁定**（spec 实施计划 §8 已记）。
2. **Change 3：`handleAcceptedReady` 必须无条件记录 connectionId**——否则 off 期间 ready 事件被丢弃，翻转后 coordinator 不知道连接，无法收敛（源码已修，注释说明）。
3. **Change 3 deploy：`deploy-docker-appliance.ps1` param 块**——删 `[string]$RealtimeSubscriptionLifecycleMode = "off",` 时其上方 `[ValidateSet("off","on")]` 若残留会错挂到 Image 参数（使 Image 校验只接 off/on）。**已修 + 门禁锁定**；回滚/再改时留意。
4. **Change 2：administrators_authorized_keys 坑**——Windows OpenSSH 对管理员组用户**强制**读 `C:\ProgramData\ssh\administrators_authorized_keys`（非 `~/.ssh/authorized_keys`），ACL 必须仅 SYSTEM+Administrators（§3.2 步骤已含 icacls 修复）。
5. **Change 2：runner 管理员权限前提**——`Add-WindowsCapability` 与防火墙规则需 elevation；runner 无管理员权限则改用管理员账户手动执行一次（脚本幂等可重复）。
6. **Change 3：auto_reconcile=false 语义是"不自动收敛 + 保留现有订阅"**（手动接管），**不是"撤销所有订阅"**——runbook §写配置已说明。

---

## 六、回滚路径

| Change | 回滚 |
|---|---|
| 1 | 纯增量（+logs 通道，stdout 保留）；撤 otel.py/logging.py 改动即可，无状态迁移 |
| 2 | workflow 退役有 git 历史可恢复；OpenSSH 卸载=`Remove-WindowsCapability OpenSSH.Server` + 删防火墙规则（runbook §6，不自动执行） |
| 3 mist | migration 017 是新增表（DROP TABLE runtime_configs）；backend 改动随镜像回滚 |
| 3 deploy | `.env`/compose 改动：部署前备份 .env 现值；回滚=恢复 env + 镜像回滚；set-* 脚本改造是破坏性变更，同一批更新 `set-windows-realtime-business-allowlist.yml` 调用参数 |

---

## 七、文件与记忆索引（接手指向哪里查细节）

- **OpenSpec change 目录**（spec 五件套 + implementation-plan + tasks 勾选状态）：
  - `mist/openspec/changes/datasource-logs-to-openobserve/`
  - `mist/openspec/changes/windows-openssh-ops-channel/`
  - `mist/openspec/changes/declarative-realtime-configuration/`
- **mist 仓关键新文件**：
  - `deploy/database/migrations/017_create_runtime_configs.sql`
  - `libs/shared-data/src/entities/runtime-config.entity.ts`
  - `apps/mist/src/realtime-subscriptions/runtime-config.service.ts`
  - `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts`
- **mist-deploy 关键新文件**：
  - `scripts/enable-windows-openssh.ps1` + `test-enable-windows-openssh.ps1`
  - `scripts/write-realtime-business-allowlist.cjs`
  - `docs/runbooks/windows-openssh-ops.md`（含写配置章节）
- **文档**：`mist/docs/otel-observability-queries.md`（datasource 日志段 + lifecycle gauge 查询）
- **背景交接**：`mist/otel-whitebox-20260810/handoff-prompts-ops-http-tooling.md`（本线程源头）

---

## 八、tasks 勾选状态（openspec/changes/*/tasks.md）

- Change 1：**14/18 已勾**（§1-2 代码/测试、§3.1/3.3 验证、§4 文档、§6.1/6.2 已勾；**§3.2 mock 验证、§5 生产验证、§6.3 归档未勾**）
- Change 2：**8/13 已勾**（§1.1 代码、§3 退役、§4 runbook、§5.2、§6.1/6.2 已勾；**§1.0 前置验证、§1.3-1.4 生产操作、§2 本地迁移验证、§5.1 生产、§5.3 evidence、§6.3 归档未勾**）
- Change 3：**25/29 已勾**（§1-5 代码/deploy 全部、§6.1-6.3 验证、§7.1/7.2 已勾；**§6.4 生产 HIL、§7.3 归档未勾**）

未勾项全部是"需要盒子/交易时段/生产"的 HIL 与归档，对应本文档 §3 各 checklist。
