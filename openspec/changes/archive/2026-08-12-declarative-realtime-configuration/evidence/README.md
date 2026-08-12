# Evidence: declarative-realtime-configuration

验证证据占位目录（spec 确认后、实施验证时填充）：

- 生产 HIL（tasks 6.4）：ssh 通道改 DB assignments → ≤60s 自动收敛
  （OO gauge converged 变化、免重启）；auto_reconcile 开关迁移实测。
- migration 验证：016 建表 + 初始行（env 现值）迁移结果。
- 单测/CI：mist `pnpm test:ci`、deploy `test-*.ps1` 输出。
