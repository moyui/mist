# Tasks: 实盘验证缠论买卖点算法（指数标的）

## 1. 订阅生命周期 SecurityType.INDEX 门禁放开

- [x] 1.1 `[mist]` 修改 `RealtimeSecurityAllowlistService.refreshAssignedFromDb`，将 `security.type` 过滤条件由单值 `SecurityType.STOCK` 扩展为 `[SecurityType.STOCK, SecurityType.INDEX]`。
- [x] 1.2 `[mist]` 修改 `RealtimeSubscriptionLifecycleCoordinator.queryDesiredAuthority`，将期望权威查询中的 `security.type` 扩展为 `[SecurityType.STOCK, SecurityType.INDEX]`。
- [x] 1.3 `[mist]` 修改 `InitializeRealtimeSubscriptionDto` 与 `RealtimeSubscriptionVo`，接受 `SecurityType.INDEX`。
- [x] 1.4 `[mist tests]` 编写针对 `SecurityType.INDEX` 的 Allowlist 与 Coordinator 单元测试，验证指数标的能够成功载入白名单与完成收敛。

## 2. 告警信封上下文解析与文案增强

- [x] 2.1 `[mist]` 优化 `serializeChanBspContextSnapshot`，确保 `triggerPrice` 与 `chanBsp` 详细结构信息在快照中完整保留。
- [x] 2.2 `[mist]` 优化 `apps/notification` 中的 `buildNotificationEnvelope`，识别 `chanBsp` 上下文，在推送摘要中格式化输出点位类型（一买/二买/三买/一卖/二卖/三卖）与结构级别（笔级/段级）。
- [x] 2.3 `[mist tests]` 编写通知渲染单元测试，覆盖 5m 笔级、30m 段级等各类 Chan BSP 信封文案。

## 3. 离线 Mock 集成测试套件

- [x] 3.1 `[mist tests]` 编写 5m/30m 多周期聚合 Mock 测试，验证 `derivePeriodBars` 结合当日 Redis 1m 桶与 MySQL 历史 K 线能够精确构建满足 500/200 预算的窗口。
- [x] 3.2 `[mist tests]` 编写 4 大指数在 5m bi/duan、30m bi/duan 策略下的 `ChanBspDetector` 纯内存全链路求值测试，验证买卖点判定与游标去重无异常。

## 4. 生产环境数据准备与配置（前置执行）

- [x] 4.1 在数据库 `securities` 表中注册 4 个指数：上证指数 (`000001`)、创业板指 (`399006`)、科创50 (`000688`)、平均股价 (`880003`)，类型设为 `INDEX`。
- [x] 4.2 配置 `security_source_configs`：前 3 个指数绑定 QMT（`000001.SH`, `399006.SZ`, `000688.SH`），平均股价绑定 TDX（`880003.SH`）。
- [x] 4.3 触发历史数据采集（`/v1/collector/collect`），预热 4 个指数过去 30 个交易日的 5m 与 30m 历史 K 线。
- [x] 4.4 在 `strategy_definitions` 中录入并启用 4 个指数的 5m bi、5m duan、30m bi、30m duan 策略实例（共 16 个策略）。
- [x] 4.5 激活 4 个指数的实时订阅分配（Assignments），旧股票订阅已停用。

## 5. 实盘交易时段验证（明日开盘）

- [ ] 5.1 09:15 验证定时任务执行 read-before-reset，QMT 与 TDX 成功下发 4 个指数的订阅命令。
- [x] 5.2 09:30 验证首批 tick snapshot 正常流入并落入 Redis 1m candle 聚合桶。
- [x] 5.3 09:35 验证首根 5m candle 封存并触发 signal app 策略扫描。
- [ ] 5.4 验证结构满足背驰/买卖点时，飞书机器人秒级推送带结构级别的通知（已弃用企业微信）。
