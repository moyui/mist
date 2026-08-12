# 2026-07-23 Realtime Promotion 生产基线

TDX/QMT formal realtime contract 已完成交易时段 HIL、terminal/datasource/backend restart、
explicit-off rollback、旧 backend image compatibility rollback 和最终双源 promotion。

当前生产基线：

| 组件 | SHA / build |
| --- | --- |
| backend | `82f0884828c66aca04d411540a3386fe2b8ed709` |
| datasource | `fa6e95180c69dc6a95e8a816ed5ae34ed6b0c7fa` |
| deploy | `b507b6a1e4f7c7f9ba3f3bef9929e4d24b03453a` |
| monitoring | `9974cbfcfbe34127eadd89fb22493e748a5c1c75` |
| TDX bridge | `mist-tdx-bridge-v1.1` |
| QMT bridge | `mist-qmt-realtime-bridge-v1.1` |

最终 desired state：TDX `builtin` + `600030.SH`，QMT `builtin` +
`300502.SZ`。最终 promotion runs 为 TDX `29974786909`、QMT
`29974839097`；两源 fresh snapshot、owner、订阅、per-symbol sequence 与
`mist_realtime_*` metrics 同时收敛。

六张 protected tables 的 row count/content digest 与 2026-07-22 baseline 完全一致，
本次未运行 migration，未观察到 K、signal、alert 或 notification 写入。

完整运行、artifact digest、recovery 和 rollback 事实见
`align-realtime-native-ingress-contracts/evidence/2026-07-23-production-hil-promotion.md`。
