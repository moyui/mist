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

## 四、备注
- 本地工作树有未提交改动（`.github/workflows/`、`tools/`），属另一项 release 工具重构，与本次运行时部署无关；deploy workflow 基于已提交 master 构建，不受影响。
- 其余活跃 change（`unify-market-data-precision`、`upgrade-backtest-decision` 等）均未开始，与本次开盘无关。
- 验证全部通过后，回填 `tasks.md` 第 5 节勾选项，并归档本 change。
