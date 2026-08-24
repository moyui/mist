# Evidence: quantity profile 写入层规范化 + 历史数据恢复(2026-08-23)

## 背景

5.5 quantity HIL 前置调查发现 `mapKToStrategyBar`(libs/shared-data/src/mappers/
k-strategy-bar.mapper.ts)对 TDX amount 再 ×10000,而 `fix-tdx-historical-amount-unit`
(08-14 归档)已把 k 表 TDX amount 统一修复为元(写入层 `normalizeTdxBarQuantity`
×10000 + migration 019 存量 ×10000)——**读取层双重换算,backtest 读到的 TDX amount
是正确值的 10000 倍**(如 600519 08-21 42.78 亿 → 4.28 万亿)。

## 决策(用户拍板 2026-08-23)

单位换算统一在**写入层**完成,k 表对每个 source 存 canonical 单位(volume=股、
amount=元),读取侧 mapper 只做 Decimal8 规范化、不做 source 缩放:

- TDX amount 万元→元 ×10000:写入层保留(`TdxSource.normalizeTdxBarQuantity`,
  与 fix-tdx 契约一致);
- QMT volume 手→股 ×100:从读取层移到写入层(`QmtSource.normalizeQmtVolume`,
  非整数手数 fail-closed,`QMT_INVALID_FRACTIONAL_VOLUME`);
- `mapKToStrategyBar` 移除两处缩放;实时窗口历史段(`SignalStrategyMarketDataAdapter`)
  与回测共用同一 mapper,一并修正。

## 代码改动(commit 089c46b,merge 98c26feb)

- `apps/mist/src/sources/qmt/qmt-source.service.ts`:`mapRow` volume 经
  `normalizeQmtVolume`(×100,Decimal8 定点,非整数 fail closed);
- `libs/shared-data/src/mappers/k-strategy-bar.mapper.ts`:删除
  `mapHistoricalVolume`/`mapHistoricalAmount` 的 source 缩放,只规范化;
- 测试:`k-strategy-bar.mapper.spec.ts`(TDX amount 12.345 → 12.345、QMT volume
  100 → 100、null 直通)、`qmt-source.service.spec.ts`(volume 1200 手 → 120000 股、
  fractional fail-closed 新用例)、`signal-strategy-market-data.adapter.spec.ts`
  (historicalK fixture amount 改为元语义);
- 文档:`extract-backtest-runtime/design.md` §quantity profile(换算点=写入层,
  k 表 canonical,读取层不缩放)。

验证:typecheck ✓、lint ✓、全量 test:ci 186 suites / 1556 tests ✓(基线 1555+1)。

## 历史数据恢复(经 mist 后端接口 `POST /v1/collector/collect`)

恢复前 k 表:TDX 日线 4366(2024-01~07-31)、TDX 1m/5m/15m/30m/60m 各 4-12 根、
QMT 日线 9 根(到 08-05,3 根 volume/amount 全 0)、schedule(东财采集)从未部署。

恢复清单(2026-08-23,非交易时段):

| source | period | 范围 | 结果 |
|---|---|---|---|
| tdx | 1440 | 2024-01-01 ~ 08-23 | 6 股 × 639 根 ✓ |
| tdx | 1/5/15/30/60 | 2026-01-01 ~ 08-23(+08-14 后补拉) | 6 股完整(1m 24800+/股)✓ |
| qmt | 1440 | 2024-01-01 ~ 08-23 | 2 股(600519/300502,仅这两只配置 qmt source)× 639 根 ✓,08-05 前 0 值已修复 |

单位实证(600519 08-21 日线):TDX volume=3347231 股、amount=4278310900 元;
QMT volume=33472 手、amount=4278311022 元 —— 手×100=3347200 股 ≈ TDX ✓,
amount 两源一致(元)✓。

## Migration 022 生产执行(2026-08-23)

`022_qmt_volume_to_shares.sql`:存量 QMT volume 手→股 ×100(forward-only,
`UPDATE k SET volume = volume * 100 WHERE source='qmt' AND volume IS NOT NULL
AND volume <> 0`)。

- 执行前快照:qmt 1282 行,vol_sum=283769468;
- 执行后:vol_sum=28376946800(×100 ✓);
- ledger `schema_migrations` 插入 `022_qmt_volume_to_shares.sql` ✓;
- readback:600519 08-21 QMT volume=3347200(股)与 TDX 3347231 一致(差 31 股,
  provider 复权/精度差异)✓。

## 5.5b Windows appliance restart/isolation HIL(2026-08-23,生产 mist-box)

前置:公共 API 链路验证——`POST /v1/strategy-backtests`(versionId=1 rule_dsl
`k.close>0`,600519 日线 2026-01-01~08-21)→ 202 receipt + PENDING → RPC 提交 →
backtest 进程执行 → COMPLETED(signalCount=271, matchedSecurityCount=1,
targetIssues=[])→ `GET /v1/strategy-backtests/6` 查询正常。**RPC-only
cutover 后公共 API 全链路可用**(runId=6)。

**restart HIL**:
1. 制造遗留 RUNNING:`UPDATE backtest_runs SET status='RUNNING' WHERE id=6`;
2. `docker restart mist-backtest`(Windows Docker Desktop);
3. 启动补偿生效:run 6 → `failed` + `error_message=BACKTEST_INTERRUPTED`;
4. 补偿日志 `backtest startup reconciled admitted=0`(BacktestStartupService);
5. 容器恢复 `healthy`。

**isolation HIL**:
1. `docker stop mist-backtest`;
2. `mist-backend` 不受影响:公共端口 8001 继续响应(HTTP 404 = 服务存活且路由
   解析正常,无该 GET 集合路径属预期);
3. `docker start mist-backtest` 恢复,health=healthy,补偿日志再次输出。

结论:backtest 与 mist-backend 完全隔离(compose 无硬健康依赖),重启自愈
(legacy RUNNING → BACKTEST_INTERRUPTED),符合 design crash/restart 语义。

## 后续

- quantity plan(引用 k.volume/k.amount 的 DSL 策略)profile 已具备证明数据;
  TDX/QMT 日线与分钟级 HIL 的最终验收结论待 5.5 收尾时汇总;
- 剩余:Windows appliance restart/isolation HIL(5.5b)、5.6 cutover 部署验收。
