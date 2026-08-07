# 2026-08-04 单条订阅恢复验证

## 结论

- TDX 单条 `subscribe` 路径通过：run `30873932301` 对 `600030.SH` 取得
  `subscribed.success`、11:10:08 新鲜 native snapshot 和 `unsubscribed.success`。
- QMT 单条 `subscribe` 路径未通过：run `30873879798` 明确返回
  `QMT_JOURNAL_RECONCILIATION_REQUIRED`；不得绕过 journal reconciliation 门禁。
- production 已部署 backend `c015e627f0b94ffb98eeca8af0a87c96413a5329` 与 deploy
  `c7b09ac64e178d452374e2e91f799f7b340cf2a7`，保持 `shadow`，仅启用
  `TDX_SUBSCRIBE_ALLOWLIST_ON_READY=true`。部署 run `30874327530` 通过。
- 部署后 TDX smoke run `30874433755` 证明 `desiredRevision=4`、`convergedRevision=4`、
  `desiredSymbols=2`、`convergedSymbols=2`，backend allowlist 为 `600030.SH,603127.SH`，并在
  11:20:08 收到 `600030.SH` 新鲜 snapshot。
- candle preflight run `30874539990` 仍为 `seriesCount=0`、`candidateCount=0`、
  `quantityProfileRejections=[]`；因此单条订阅只恢复了 terminal → datasource → backend client，
  尚未证明 snapshot → candle candidate。完整 HIL 在 11:20 允许启动窗口后被 run `30874486281`
  正确阻止，需在下午交易窗口重跑。

## 临时边界

TDX ready 后按 allowlist 串行调用单条 `subscribe`，开关默认关闭且本次生产显式启用。QMT 不采用
该临时路径。该方案不替代 authoritative set reconciliation，也不完成 task 5.4。

## 后续待办

1. 修复 backend 启动/重连时 `sync_subscriptions` 未执行或未收敛的问题，恢复 authoritative set
   reconciliation 后移除 TDX 临时开关。
2. 修复 QMT journal startup reconciliation，使 `reconciliationRequired=false` 后再验证单条和 sync。
3. 定位 TDX backend 已接受新鲜 snapshot 但 candle `seriesCount=0` 的 client → ingress → candle sink
   断点，并在支持交易窗口重跑完整 candle HIL。
