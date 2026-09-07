# 盘前 / 开盘检查 Runbook（实盘验证缠论买卖点 · 4 大指数）

> 配套 change：`verify-live-chan-bsp-index`
> 适用时机：交易日 T-1 晚间至 T 日 09:35，核心验证 4 指数（000001/399006/000688/880003）实时链路与缠论买卖点推送。
> 数据源映射：000001.SH / 399006.SZ / 000688.SH → QMT；880003 → TDX。

---

## 一、开盘前（T-1 晚间 / 次日清晨，必须避开交易时段）

### A. 部署待生效的修复（最关键，否则跑旧逻辑）
以下修复已合入 master（本地 = origin/master = `9a49e82c`），但容器仍跑旧镜像，需先部署：
- `464ff250` — 巡检 remediation 文案更正（QMT journal 解锁指引、K 线补录端点 `POST /v1/collector/collect`）
- `d1a7daf7` + `8a547ea7` — 巡检卡改飞书推送 + 微信死代码清理

**验证已生效：**
- 09:05 飞书卡按新文案出现；
- 或 `docker inspect -f "{{.Config.Image}}" mist-schedule` 比对镜像 tag（用 `git rev-parse origin/master` 取 SHA，勿手抄）。

> ⚠️ deploy workflow 必须避开交易时段（凌晨/收盘后安全），开盘时再部署会撞交易时段。

### B. 终端与数据源人工就绪
- **QMT 终端** (`XtItClient.exe`) 登录状态 —— 若 journal 锁（`reconciliationRequired`），**重启终端即自动解锁**（bridge 重注册携带新 startedAt），无需手工 observation 文件（2026-09-01 生产已验证）。
- **TDX 终端** (`TdxW.exe`) 登录状态，9003 TCP 就绪。
- Windows 宿主 `docker ps` 确认栈健康（mysql/redis/各 datasource/backend/signal/notification/schedule）。

### C. 4 指数历史 K 预热（冷启动窗口闸门）
- 确认 `ks` 表对 4 指数已有充足历史：5m ≥500 根、30m ≥200 根（约 30 交易日预热）。窗口不足 → `ChanBspDetector` 默认空，盘中无信号。
- 16 个策略实例（每指数 × 5m 笔 / 5m 段 / 30m 笔 / 30m 段）已启用、4 指数订阅分配已 ACTIVE。

---

## 二、09:05 自动盘前巡检（飞书卡片，无需手动触发）

系统 cron `0 5 9 * * 1-5` 自动跑，关注飞书群机器人卡片。6 维度全绿 = 可直接开工；任一红 = 按卡片 remediation 处理。

| 维度 | 检查内容 | 红时处理 |
|------|----------|----------|
| 链路开关 | backend/signal/tdx/qmt/redis/lifecycle/feishu 状态 | 卡片含 `Set-DockerEnvValue` / MySQL `runtime_configs` 修复命令 |
| 数据源/Journal | TDX+QMT health，QMT `reconciliationRequired` | 重启 QMT 终端优先 |
| 昨夜收盘 K 线 | 各 ACTIVE 标的前一交易日 6 周期完整性 | `POST /v1/collector/collect` 补录 |
| 活跃订阅分配 | ACTIVE 池统计 | — |
| 实时通信链路 | TDX/QMT bridge TCP ready | 查终端登录 + 9003/9004 |
| 基础服务 | MySQL / Signal health | `docker ps` + 日志 |

> ⚠️ **已知误导点**：若 klines 维度显示"未获取到前一交易日，跳过"且 `passed:true`，这是旧行为，不代表真实通过——需人工确认历史 K 已入库（日历正常情况下不会触发）。

---

## 三、开盘时实盘验证（change 第 5 节，4 项剩余）

- **09:15 — read-before-reset 下发 4 指数订阅（5.1，待验证）**
  定时任务触发 → QMT+TDX 成功下发 000001/399006/000688/880003 订阅。查各 datasource `/health` → `subscriptions`。

- **09:30 — 首批 tick 落入 Redis 1m 桶（5.2）**
  开盘 tick snapshot 正常流入并聚合进 Redis 1m candle（此前经验已绿，确认即可）。查 backend realtime ingress 日志 / OO trace。

- **09:35 — 首根 5m 封存 + signal 扫描（5.3）**
  首根 5m candle 封存（Redis closed + BullMQ）→ 触发 signal app 对 16 个指数策略扫描。

- **盘中 — 结构满足时飞书推送买卖点（5.4，待验证）**
  出现背驰/买卖点 → 飞书**秒级**推送，文案带结构级别（一买/二买/三买/一卖/二卖/三卖 + 笔级/段级）。**已弃用企业微信，只看飞书**。

---

## 四、2026-09-02 实盘核对结果

> 核对时间：2026-09-02 开盘时段，通过生产容器日志 / health 端点 / MySQL / Redis 实测。

| 项目 | 状态 | 证据 |
|------|------|------|
| A. 部署待生效修复（464ff250 / d1a7daf7 / 8a547ea7） | ✅ 已完成 | 部署镜像 `4eaa0a7b`（"bypass Phase C central expansion"）已包含三笔提交；容器 09:05 前重启（Up 9h）；09:05 巡检已按新代码跑 |
| 09:05 盘前巡检 | ✅ 通过（操作员确认） | 09:05 巡检卡已推送飞书；`klines` 维度虽红，操作员判定无碍实盘，按通过处理（详见下方残留项①） |
| 5.1 09:15 read-before-reset 下发 4 指数订阅 | ✅ 已完成 | QMT `subscriptions.ready:true / pushState:verified`；TDX `desiredSymbols=1/convergedSymbols=1`；4 指数均有 `candlefinal` BullMQ 作业流 |
| 5.2 09:30 tick → Redis 1m | ✅ 已完成 | Redis 存在 `candlefinal-v1-qmt-5/8/11-1m`、`candlefinal-v1-tdx-12-1m` 且时间戳为今日（如 `…11-1m-1788316140000` ≈ 10:29） |
| 5.3 09:35 首根 5m 封存 + signal 扫描 | ✅ 已完成 | signal 日志 `chan_bsp plan compiled`（def 9–22，16 策略）；`strategy_alert_events` 于 09:35:05–06 生成 4 条 |
| 5.4 盘中结构满足时飞书推送买卖点 | ✅ 通过（操作员确认） | 操作员在飞书群观察到买卖点推送；notification 仍存在 wechat 死信日志（残留通道），不阻塞飞书投递（详见下方残留项②） |

### 残留 / 待清理项（不阻塞今日开盘）

**① 09:05 巡检 klines 维度噪声（操作员已判通过）**
- **15m / 60m 系统性缺失**：全表 `k` 中 `period IN (15,60)` 行数 = 0。收盘同步只采集 DAY/1m/5m/30m，从不入库 15m/60m，而巡检 `REQUIRED_INTRADAY_PERIODS` 含 15m/60m → 每日必红。属巡检口径与数据管线不一致（策略只用 5m/30m）。后续可选：同步补采 15m/60m，或收窄巡检周期。
- **000688（科创50, id=11）2026-09-01 真实缺口**：该标的有 1m(241) 但缺 5m/30m/DAY（对比 08-28、08-31 均完整），当日收盘同步该标的 5m/30m/DAY 部分失败。影响 000688 的 chan_bsp 窗口，建议补录：`POST 后端 8001 /v1/collector/collect`，body `{"code":"000688.SH","period":5,"startDate":"2026-09-01","endDate":"2026-09-01"}`（再补 30 / 1440）。

**② 策略告警路由 wechat→feishu（2026-09-07 午休已修复，生产生效）**
- 根因：box `.env` `NOTIFICATION_CHANNELS=wechat`，而 `NOTIFICATION_WECHAT_WEBHOOK` 已随微信清理移除 → 每条策略告警（9/2 #63-66、9/3 #71、9/4 #78、9/7 #82）全部 dead-letter，飞书从未被尝试。飞书上能看到的只有 09:05 巡检卡（schedule 直发，另一条路）。
- 修复：`.env` 改 `NOTIFICATION_CHANNELS=feishu` + `docker compose --project-name mist-docker-appliance -f F:\MistDocker\compose.yaml --project-directory F:\MistDocker up -d --force-recreate notification`；容器 env 已生效、healthy。通道代码未动。
- ✅ **回退风险已消除（2026-09-07，mist-deploy `0c08423` 已推 master）**：workflow 输入 `notification_channels` default / `.env.example` / compose fallback / test 断言（CI 门禁）全部 wechat→feishu，本地 `test-docker-compose-config.ps1` 全绿。下次部署不会再覆盖回 wechat。
- 历史死信事件（#63-66/#71/#78/#82）不可经 replay 补投：`AlertReplayService` 按原 channel 重推，会变成 "no adapter configured for channel wechat" 再死一次。下一条真实信号即为端到端验证。

## 五、备注
- 本地工作树有未提交改动（`.github/workflows/`、`tools/`），属另一项 release 工具重构，与本次运行时部署无关；deploy workflow 基于已提交 master 构建，不受影响。
- 其余活跃 change（`unify-market-data-precision`、`upgrade-backtest-decision` 等）均未开始，与本次开盘无关。
- 验证全部通过后，回填 `tasks.md` 第 5 节勾选项，并归档本 change。
