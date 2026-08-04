# 2026-08-03 Realtime Provider Quantity Profile Evidence

## 结论

- 当前 pinned TDX production runtime 的 realtime `Volume/Amount` 是 decimal string，固定 profile 为
  `手/万元`；backend adapter 使用 `volume × 100` 和 `amount × 10000` 输出股/人民币元。
- QMT realtime `volume` 是非负安全整数 number，单位为手；`amount` 是 provider float number，单位为
  人民币元。adapter 使用 `volume × 100`，amount 只规范化可观察值，不声称恢复 provider 已丢失精度。
- 当前 evidence 未自然出现 quantity 缺字段、null、非法值、counter 异常跳变或 profile drift；这些
  分支标记为 `not-observed`，由 deterministic negative tests 和 active change
  `capture-realtime-provider-anomalies` 承接，不阻塞正常 converter 实现。

## 固定证据

| source | production run / artifact | capturedAt | provider sample | 类型 | 接受的 profile |
| --- | --- | --- | --- | --- | --- |
| TDX | `mist-deploy#29974786909`, SHA-256 `e2fc3a4307eb1f552d712400860555147a05ae7b03f8e5b0b50badb6507119bc` | `2026-07-23T10:35:35+08:00` | `Average="28.44"`, `Volume="576508"`, `Amount="163965.55"` | string/string | 手/万元 |
| QMT | `mist-deploy#29974839097`, SHA-256 `c92bdb0b5fb28e278842cb6c06fef9e7bb9fda038235639a9d5f6a170949e424` | `2026-07-23T10:37:40.598296+08:00` | `volume=246754`, `pvolume=24675386`, `amount=12646617700` | integer number / number | 手/元 |

TDX 换算校验：`576508 × 100 = 57650800` 股，`163965.55 × 10000 = 1639655500` 元；两者得到的累计均价
约为 `28.44`，与同一 native snapshot 的 `Average="28.44"` 一致。该计算只用于固定 artifact 的 profile
评审，不进入运行时 profile 猜测逻辑。

QMT 的 production artifact 已通过同日真实 `get_full_tick`、backend readback、restart 和 freshness HIL；
其字段单位同时遵循已接受的官方股票 tick 契约。`pvolume` 仅作为本次 evidence 交叉检查，不进入 Mist
canonical contract。

## 2026-08-04 当前候选复核

- TDX run `30881943989`：native `Volume="901517"`、`Amount="253641.50"`，canonical 分别为
  `"90151700"` 股和 `"2536415000"` 元，继续支持 pinned `手/万元` profile。该 native payload 没有
  `AsOf`，所以 profile 通过不代表 candle event-time 门禁通过。
- QMT run `30882148246`：native `volume=28204`、`amount=3773928400`，canonical 分别为
  `"2820400"` 股和 `"3773928400"` 元，继续支持 pinned `手/元` profile；`time/stime` 与 canonical
  `eventTime` 一致。
- 同次 QMT historical 只读请求只返回 provider fill 的零量额样本，不能证明 non-zero historical
  quantity profile。historical reader 门禁继续由 owning backtest/runtime change 保持未完成。

## 历史数据与旧 fixture 边界

- `mist-datasource/tests/fixtures/tdx/live_market_snapshot_600519.json` 是 2026-06-29 的 external-HTTP
  capture，来自不同 artifact/入口，`Volume/Amount` 表现为股/元。它不能覆盖当前 production bridge
  v1.1 的手/万元 profile，也不能触发运行时自动选择。
- datasource historical bars 可继续用于 provider 可用性和 reader owning change 的单位评审；本 change
  不迁移或回填 MySQL `k.volume/amount`，也不把 historical profile 混入 realtime adapter。

## 后续门禁

1. converter/unit/contract tests 构造 absent、null、wrong type、empty、sign、exponent、scale、range、NaN、
   Infinity、unsafe integer、negative zero 和 multi-symbol partial failure。
2. 最终 shadow/HIL 观察真实 quantity continuity、null/缺字段分布和 profile stability；没有自然异常时保留
   `not-observed`，不制造故障。
3. bridge/runtime identity 或真实 profile 发生变化时保持 `off|shadow`，通过新的 reviewed OpenSpec delta
   修改固定 adapter contract。
