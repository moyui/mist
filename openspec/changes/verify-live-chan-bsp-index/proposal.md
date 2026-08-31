# Proposal: 实盘验证缠论买卖点算法（指数标的）

## Why

Mist 实时交易链路（`realtime-market-data-ingress` -> `complete-current-day-realtime-candles` -> `run-realtime-strategy-evaluation` -> `deliver-strategy-notifications`）及缠论买卖点算法（`ChanCore` + `ChanBspDetector`）已在主干分支完成代码交付与单测闭环。为了在真实 A 股交易环境中验证缠论三类买卖点求值、中枢延伸/合并、背驰力度对比与飞书告警推送的实时性与稳定性，需启动实盘验证。（已弃用企业微信，通知主通道切为飞书）

为控制实盘首期范围与噪音，首批标的聚焦代表性核心指数（上证指数、创业板指、科创50、平均股价），暂不上股票；策略周期配置为 5 分钟 (5m) 与 30 分钟 (30m)，并同时挂载笔级（bi）与段级（duan）中枢结构，双向买卖点全开。

## What Changes

1. **放开订阅生命周期的证券类型门禁**：
   - 升级 `RealtimeSecurityAllowlistService`、`RealtimeSubscriptionLifecycleCoordinator`，将硬编码的 `security.type = 'STOCK'` 改为同时支持 `STOCK` 和 `INDEX`。
   - 升级 `InitializeRealtimeSubscriptionDto` 与 `RealtimeSubscriptionVo`，接受 `SecurityType.INDEX` 类型的订阅初始化。
2. **多数据源标的路由规划**：
   - 交易所 3 大标准指数（`000001.SH` 上证指数、`399006.SZ` 创业板指、`000688.SH` 科创50）走 QMT 原生订阅。
   - 通达信专有板块指数（`880003` 平均股价）走 TDX 订阅。
3. **5m 与 30m 周期笔/段缠论买卖点实时求值**：
   - 实时由 1m candle 经 `derivePeriodBars` 聚合为 5m / 30m 桶并拼接 MySQL 历史 K 线。
   - 支持同一指数同时挂载 5m bi、5m duan、30m bi、30m duan 4 组独立策略定义。
   - 开盘前必须补齐 5m（>=500根）与 30m（>=200根）历史 K 线以预热窗口预算。
4. **飞书告警文案与上下文增强（已弃用企业微信）**：
   - 告警信封解析 `chanBsp` 上下文，明确展示 `[笔级/段级]`、`[一买/二买/三买/一卖/二卖/三卖]` 及触发价格。
5. **基于 Mock 的离线验证套件**：
   - 编写包含类型门禁放开、5m/30m 动态聚合、笔/段买卖点求值及通知渲染的纯内存 Mock 单元/集成测试。

## Capabilities

### New Capabilities
- `live-chan-bsp-index-verification`: 指数标的实时缠论买卖点求值与飞书告警链路验证规范（已弃用企业微信）。

### Modified Capabilities
- `production-realtime-subscription-lifecycle`: 订阅期望权威与白名单支持 `SecurityType.INDEX`。
- `chan-bsp-realtime-evaluation`: 支持指数 5m 与 30m 笔/段双级别实时策略求值。
- `strategy-notification-delivery`: 增强缠论买卖点飞书通知渲染，显示结构级别与点位（已弃用企业微信）。

## Impact
- **后端 (mist)**：`apps/mist/src/realtime`、`apps/mist/src/realtime-subscriptions`、`apps/signal`、`apps/notification`、`libs/signal`。
- **数据库**：`securities` 录入 4 个指数及数据源配置；`ks` 补齐 5m/30m 历史数据；`strategy_definitions` 录入 5m/30m 笔/段策略。
- **数据源 (mist-datasource)**：无破坏性改动，QMT 与 TDX 按标准符号（`000001.SH`, `399006.SZ`, `000688.SH`, `880003`）接收订阅请求。
