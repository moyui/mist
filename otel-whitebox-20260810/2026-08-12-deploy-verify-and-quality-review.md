# 2026-08-12 凌晨 — 部署/验证执行 + decouple/VWAP 项目质量审查

> 来源：2026-08-12 凌晨 01:00–04:30 自动化部署任务 + 用户交互验证 + 项目质量审查。
> 本文档自包含：记录所有动作（含 workflow run id）、结论、发现的问题，以及
> `decouple-bridge-callback-and-correct-vwap-bounds` 的项目质量审查结论。
> 供后续会话/线程复用，避免重复探索。

---

## 〇、背景

用户 08-11 收尾：3 个运维 change（datasource 日志进 OO / Windows OpenSSH 通道 /
声明式 realtime 配置 + migration 017）+ decouple-bridge + VWAP 修正代码均合 master，
终端 v3.0 桥脚本已手动替换并重启。用户排定凌晨 3:40 自动「部署 + 非交易验证」，
预批准 mist-production，去睡觉。

三步执行：
1. **01:00–01:30 排程准备**：读两份 handoff → 问 2 个澄清问题 → 调研部署机制 → 建 cron。
2. **03:40–04:00 自动执行**：发现部署是 no-op → 转「验证」→ 触发多个 workflow。
3. **04:00–04:30 用户反馈后**：按指示重部署 + OO 查询 + 项目质量审查。

---

## 一、动作时间线（所有 workflow run 可追溯）

### Phase 1 — 排程准备（01:00）

| 动作 | 结果 |
|---|---|
| 读 `2026-08-11-full-day-summary.md` + `handoff-ops-tooling-landing-20260811.md` | 理解 3 运维 change + decouple/VWAP 范围 |
| 问用户：①自动化主任务范围 ②终端重启状态 | 答：触发部署+监控+非交易验证；终端已重启 v3.0 |
| 用户补充："我已批准，你可以自动部署" | 解除审批顾虑 |
| `gh auth status` | ✅ moyui，scopes=repo+workflow |
| 读 `deploy-windows-mist-stack.yml` | 理解 inputs（image_tag/datasource_image_tag/...）+ environment: mist-production |
| 查 master SHA + build 状态 | mist `71f0c66e…`、datasource `528decf5…`、fe `ea4632a0…`；Build/Datasource CI 均 success |
| 读上次部署 `31509011752` 日志拿 prod tag | mist `4d5efda4…`、ds `528decf5…`、fe `ea4632a0…`、productization=**shadow** |
| 建 cron `40 3 * * *`（一次性，automation-ff9e312e…） | 排定 03:40 触发 |

### Phase 2 — 自动执行（03:40）

| # | 动作 | run id | 结果 |
|---|---|---|---|
| 0 | 解析 SHA + 查 build + 读 prod tag | — | 全部就绪 |
| ★ | `git diff --stat 4d5efda..71f0c66` | — | **5 个 .md，零代码** → 部署是 no-op |
| ★ | `git merge-base --is-ancestor 537119c 4d5efda` | — | **YES** → declarative+017 已在 prod |
| ★ | 读 31509011752 deploy log | — | `Applied 017_create_runtime_configs.sql`、`schema_migrations=17` → 017 已 apply |
| — | **决策：跳过 no-op 生产部署** | — | 按"发现与描述矛盾就上报、不盲目执行"原则 |
| 1 | 触发 lifecycle audit | `31529346405` | ❌ failure（**假失败**：docker inspect mist-monitoring 缺失 → stale exit code；数据已捕获） |
| 2 | 触发 bridge inspect | `31529350929` | ❌ failure（**假失败**：datasource_ref 默认钉旧 pin `d1225e61`=v2.0） |
| 3 | 触发 datasource logs dump | `31529355681` | ✅ success（TDX ingest `300059.SZ`+`600519.SH`，trace_id 在日志） |
| 4 | 读 audit/allowlist 脚本 | — | 发现 allowlist 计数读 `.env`（已退役，=0 是设计预期）；workflow 默认 `600030.SH` 过时 |
| 5 | 重跑 bridge inspect（master ref） | `31529995560` | ✅ success：TDX sha exact 匹配 v3.0；QMT inconclusive（wrapper sha 不同 + platform_unavailable） |
| 6 | 触发 OpenSSH enable | `31529973803` | ✅ success：sshd running、key-only、防火墙 TCP22 仅 LAN、`administrators_authorized_keys` 缺 |
| 7 | 存 3 条记忆 + 出报告 | — | ops-ride-along / allowlist-defaults-stale / bridge-inspect-stale-ref-default |

### Phase 3 — 用户反馈后重部署 + 验证（04:00）

用户 4 条指示：①重部署 ②QMT 只看版本号不看指纹、终端正常 ③OO 查日志（给密码）④allowlist 默认值是否要先修。

| 动作 | run id | 结果 |
|---|---|---|
| 触发 Deploy Windows Mist Stack（no-op，按用户要求） | `31535296889` | ✅ completed/success（prod tag→71f0c66，migration 幂等，health check 过） |
| OO `service_name` 分布查询 | — | `mist-backend:34369`、`tdx-datasource:11440`、`chan-api:52`、`backtest:24`、`signal:20`；**无 qmt-datasource** |
| OO 日志真入库确认（Change 1） | — | ✅ tdx-datasource 日志在 OO（11440 条）；QMT 侧未入库（O2b 缺口） |
| `gh run approve` | — | ⚠️ 该 gh 版本无此子命令；但 mist-production 环境**自动放行**（OpenSSH/部署均无需手动审批） |

> OO 凭据由用户口述提供，本文档**不记录密码**。

### Phase 4 — 项目质量审查（04:15）

| 动作 | 结果 |
|---|---|
| 读 `project-quality-governance-guide.md` | 取 §12 审查模板 + §6/§8 检查项 |
| 读 decouple change design/specs/tasks | 契约 + §5 讨论项已标注 |
| 读 TDX+QMT 桥队列代码 + toSealed VWAP 代码 | 见质量审查 §四 |
| 读 guardrail 测试 `test_terminal_bridge.py` | 静态 AST 强制 thin-callback（双桥） |
| `jest open-candle-aggregator.spec.ts` | ✅ 26/26 |
| `pytest test_terminal_bridge.py` | ✅ 15/15（单文件覆盖率 15% 是预期，非失败） |

---

## 二、结论

### 部署
- **原计划部署是 no-op**：`71f0c66` vs prod `4d5efda` diff = 纯 docs（5 个 .md）；datasource/fe 与 prod 完全相同。3 运维 change（logs→OO `3ded4e6` / declarative+017 `537119c` / bridge queue `4869757`）**早已随 31509011752 ride-along 上线**。handoff 的"pending deploy"是从"没做专门运维部署"视角写的，功能上代码已全 live。
- **重部署（31535296889）成功**：prod tag 现贴 `71f0c66`，migration 017 幂等再跑（已 apply），health check 过。无功能变化。

### 验证（非交易时段）
| 项 | 结论 | 证据 |
|---|---|---|
| migration 017 | ✅ 已 apply | deploy log `Applied 017`；`schema_migrations=17` 行 |
| declarative config 活 | ✅ | 017 建表 + prod 跑 4d5efda（含 537119c） |
| allowlist 非空 | ✅ | TDX 实际 ingest `300059.SZ`+`600519.SH`（03:43 dump，6s 间隔） |
| allowlist env=0 | ✅ 设计预期 | declarative 退役 env，DB 唯一来源 |
| TDX 桥 v3.0 | ✅ exact 匹配 | inspect master ref：installed sha == canonical sha |
| TDX ingest 活 | ✅ | dump 实证持续 ingest |
| datasource 日志 trace_id | ✅ 格式 | `trace=077c…(32hex) span=0849…(16hex)`，TraceContextFormatter 工作 |
| **datasource 日志入 OO** | ✅（TDX）/ ❌（QMT） | OO 11440 条 tdx-datasource；**0 条 qmt-datasource** |
| OpenSSH enable | ✅ | sshd running、key-only、防火墙 TCP22 仅 LAN 192.168.31.0/24 |
| QMT 桥 v3.0 | ⚠️ inconclusive | 静态 sha 不同（wrapper 天然）+ platform_unavailable；用户称终端正常，按版本号待运行时验 |
| OO 直查 | ✅ 通 | OO 5080 可达，default logs 流 45907 doc |

### 发布与回滚
- **原子发布集**：mist `4d5efda` + datasource `4869757/528decf` + 终端桥 v3.0（已同批 ride-along 上线）。
- **migration 兼容性**：无 DB 变更由本 change 引入（VWAP 在内存聚合器；桥在终端侧）。017 是 declarative 引入，已 apply。
- **回滚**：mist 镜像 + datasource 镜像 + 终端桥脚本 matched set。已封存 candle 保留 clamp 值（forward-only），回滚只停后续 clamp，无 schema 不兼容。

---

## 三、发现的问题（需跟进）

| ID | 问题 | 状态 | 说明 |
|---|---|---|---|
| P1 | **handoff "pending deploy" 误导** | 已澄清 | 3 运维 change 实际已 ride-along 上线；后续判断是否需部署先查 `git merge-base --is-ancestor` + `git diff --stat`，别只信文档 |
| P2 | **set-allowlist 工作流默认过时** | 待修 | 默认 `600030.SH`，生产实际 `300059.SZ`；writer 是 reconcile 语义，盲跑默认会改坏 allowlist。**改前先只读探 DB** |
| P3 | **bridge inspect datasource_ref 钉旧 pin** | 待修 | 默认 `d1225e61`(v2.0)，不传会误报 bridge 不匹配；触发必须 `-f datasource_ref=<master SHA>` |
| P4 | **lifecycle audit 假失败** | 已诊断 | `docker inspect mist-monitoring`（容器已退役）→ stale `$LASTEXITCODE=1`；数据已捕获但 upload step 被 success() 门控跳过。建议脚本末尾 `exit 0` 或修容器列表 |
| P5 | **QMT 日志未入 OO（O2b 缺口）** | ✅ 已解决 | **08-12 已解决**：根因 = QMT `platform_unavailable`（终端未登录）→ 无 ingest 日志产生 → OO 自然无入库（**非 O2b 代码缺陷**）。QMT 数据流恢复后 `qmt-datasource` 600 条/10min 正常入库（TDX 477 条对比），trace_id 完整 32-hex 顶层 |
| P6 | **QMT 桥 inspect inconclusive** | ✅ 已解决 | **08-12 已解决**：`bridge.ready=True, realtime.state=running, lastQuoteAge=2.4s, subscriptions.ready=True, reconciliationRequired=False`；backend 日志 `candle ingest start source=qmt symbol=300502.SZ` 每 ~3s |
| P7 | **mist-production 不需手动审批** | 已确认 | OpenSSH/部署均自动放行；`gh run approve` 在本 gh 版本不是子命令，但无需用 |

> P1/P2/P3 已存记忆（`ops-changes-already-live-ride-along` / `allowlist-defaults-stale` / `bridge-inspect-stale-ref-default`）。

---

## 四、项目质量审查 — `decouple-bridge-callback-and-correct-vwap-bounds`

> 按 `project-quality-governance-guide.md` §12 模板。范围 = **A. 桥回调解耦（队列）** + **B. VWAP 反向修正**。

### 范围
- **mist** `4d5efda`（toSealed VWAP clamp）— `apps/mist/src/realtime/candle/open-candle-aggregator.ts:595-612`
- **mist-datasource** `4869757`/`528decf`（TDX+QMT `BRIDGE_QUEUE` + `_drain_bridge_queue`）
- 已部署生产；终端桥 v3.0 已替换；含 worktree 否；含 DB migration 否（纯内存 + 终端脚本）

### 结论：通过（0 高 / 0 中 / 4 低）

### Findings

| ID | 严重度 | 位置 | producer→consumer 影响 | 建议 |
|---|---|---|---|---|
| **F1** | LOW | `open-candle-aggregator.ts:608-610` | `vwap=amount/volume`（浮点）→ clamp 后 sealed high/low 可能带 **sub-cent 精度**（如 1349.4286），与历史 MySQL `DECIMAL(20,2)` OHLC 不一致（§6.5 重精度一致） | clamp 前 round：`Math.max(high, round(vwap*100)/100)`，或文档化"实时 sealed OHLC 可携带 vwap 精度"。影响低（策略按范围用 high/low，sub-cent 可忽略；volume/amount 不受影响） |
| **F2** | LOW | design §2.5 / specs delta | VWAP clamp **只作用实时 Redis sealed candle**；历史 MySQL OHLC（provider sync，延期）保留原始采样带 → 同一 bar 实时 high ≥ 历史 high | 文档化 clamp 的实时专属 scope，避免下游跨源比较同 bar high/low（实时采样伪影修复 vs 历史完整 bar，设计可辩护，仅缺文档） |
| **F3** | LOW | `mist_tdx_realtime_bridge.py:432-441` | TDX 队列元素是 `code`（信号），drain 时 `get_quote(code)` 取**当前**快照 → 同 code 连续 tick 突发 = 多次 fetch 同一快照 = 重复 send。maxlen=1000 有界，无 OOM | 每轮 drain 去重（unique codes）。QMT 不受影响（队列存完整 payload） |
| **F4** | LOW | `mist_tdx_realtime_bridge.py:421-422` | TDX 回调 `except Exception: pass` **静默吞错**；QMT 用 `_bounded_diagnostic` 记录 → 观测不对称 | TDX 对齐 QMT 做 bounded 诊断，提升回调错误可见性 |

### 强项（做得好的）
1. **静态 AST guardrail 强制 thin-callback**（`test_terminal_bridge.py:134/144`）：`_extract_function_section` 抽出 `_make_subscription_callback` 函数体，断言不含 `get_market_snapshot`/`_push_snapshot`、含 `BRIDGE_QUEUE.append` — **双桥防回归到位**。
2. **specs delta 把 high/low 语义变更写成 SHALL 契约**；design §4 明确标 §5 讨论项。
3. **队列有界**（deque maxlen=1000）+ 回调不开线程（guardrail 禁 `threading.Thread`）+ 永不 raise。
4. **重入真实消除**：回调仅 append（GIL 原子）；主线程顺序 drain+fetch+send。
5. **计数器单写者**（callback_count 仅回调线程写、fetch_* 仅主线程写）→ 无 race。
6. **VWAP 4 测试**含 null/zero no-op；guardrail 双桥覆盖。

### 验证
| 命令/证据 | 结果 | 说明 |
|---|---|---|
| `jest open-candle-aggregator.spec.ts`（本次跑） | ✅ 26/26 | 含 4 VWAP 用例（high/low 修正 + 区间内不动 + null/zero 不修正） |
| `pytest test_terminal_bridge.py`（本次跑） | ✅ 15/15 | thin-callback guardrail + threading 禁止 + 队列对齐 |
| full §11 baseline | ⏸ 未本次重跑 | 沿用汇总：mist `test:ci 1244 passed`+typecheck+lint；datasource `514 passed`+ruff+pyright |
| `openspec validate` | ✅（汇总） | change 四件套齐 |
| 生产 HIL | ⏸ 待 9:30 | candle 封存 / VWAP 出界复跑 / droppedFrames=0 |

---

## 五、待办（开盘后 + 用户决策）

### 交易时段 HIL（9:30+）
- [ ] candle 封存持续增长（`mist_candle_sealed_total`，300059.SZ + 600519.SH）— decouple/VWAP change 范畴
- [ ] VWAP 出界复跑（v3.0 修正后理论 0）— 验证 F1/F2 实际影响（decouple change 范畴）
- [ ] 观测帧 runtime：callback→fetch/send + droppedFrames=0 + fetch_none=0（decouple change 范畴）
- [x] **QMT 数据流恢复**（08-12 已验证）：`bridge.ready=True, realtime.state=running, lastQuoteAge=2.4s`；backend 日志 `candle ingest start source=qmt symbol=300502.SZ` 每 ~3s
- [x] **QMT 日志入 OO**（08-12 已验证）：`qmt-datasource` 600 条/10min（P5 根因 = QMT 之前无数据流，非 O2b 缺陷）
- [x] **allowlist 免重启收敛 / auto_reconcile 切换**（Change 3 tasks 6.4，08-12 已验证）：false↔true DB UPDATE，backend StartedAt 全程不变，日志 `auto_reconcile enabled: triggering full alignment`，datasource sync_subscriptions success ×93、converged=2=desired

### 用户决策
- [ ] **F1**：VWAP clamp 是否 round 到 2 位？（一个 `Math.round(vwap*100)/100` + 补测试）
- [ ] **P2**：allowlist 默认值修复（`600030.SH`→`300059.SZ`）— 改 workflow yaml + commit，还是先只读探 DB？
- [x] **SSH key 分发**（一次性手动，2026-08-12 已完成）：macOS `ssh-keygen -t ed25519 -f ~/.ssh/mist_ops_ed25519` → 经 `distribute-windows-openssh-key` workflow 装入 `administrators_authorized_keys` + ACL（SYSTEM+Administrators）→ sshd restart。**实测用户名 = `12705`**（Administrators 组成员，非 `moyui`；`moyui` 是 macOS 用户名，盒子不存在）；`ssh mist-box` 别名通过（`desktop-t3b1o2j\12705` / `DESKTOP-T3B1O2J`）。~/.ssh/config Host mist-box（User 12705）已配。
- [x] **归档**（08-12 已完成 3 运维 change）：`declarative-realtime-configuration`（5b979d0）+ `datasource-logs-to-openobserve` + `windows-openssh-ops-channel`（64f8ea7），全部 evidence 落盘 + tasks 全勾 + `openspec validate --all --strict` 68/68。**decouple change 待其 HIL（candle/VWAP/观测帧）后归档**。

### 本审查落盘
- 本文件：`mist/otel-whitebox-20260810/2026-08-12-deploy-verify-and-quality-review.md`

---

## 六、关键 commit / run 索引

| 仓库 | commit | 内容 |
|---|---|---|
| mist | `4d5efda` | toSealed VWAP 反向修正（生产已跑） |
| mist | `537119c` | declarative config + migration 017（生产已跑） |
| mist | `71f0c66` | docs(handoff)（本次部署 = no-op） |
| mist-datasource | `4869757`/`528decf` | TDX+QMT 桥队列解耦 + guardrail（生产已跑） |
| mist-datasource | `3ded4e6` | datasource 日志进 OO（O2b，TDX 侧生效，QMT 侧 P5） |

| workflow run | 结论 |
|---|---|
| `31509011752`（08-11 15:48） | 上次成功部署（ops change ride-along 上线，prod=4d5efda/528decf/shadow） |
| `31529346405` | lifecycle audit 假失败（P4） |
| `31529350929` | bridge inspect 假失败（P3，stale ref） |
| `31529355681` | datasource dump ✅ |
| `3152995560` | bridge inspect master ref ✅（TDX v3.0 exact） |
| `31529973803` | OpenSSH enable ✅ |
| `31535296889` | 重部署 ✅（no-op，prod→71f0c66） |
