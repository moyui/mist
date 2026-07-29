## 1. OpenSpec 与 canonical fixture

- [x] 1.1 对新 change 执行 OpenSpec strict validation
- [x] 1.2 将 `mist` realtime fixture 迁至 `test/fixtures/realtime` 并以 `.sha256` sidecar 替代 manifest
- [x] 1.3 更新 backend contract test 和 archive 之外的当前路径引用

## 2. Consumer 仓 fixture

- [x] 2.1 将 `mist-datasource` fixture 迁至 `tests/fixtures/realtime` 并更新 unit test
- [x] 2.2 将 `mist-deploy` fixture 迁至 `scripts/fixtures/realtime`，更新 PowerShell tests 与 `.gitattributes`
- [x] 2.3 将 `mist-monitoring` fixture 迁至 `tests/fixtures/realtime` 并更新 contract test

## 3. Monitoring 文档

- [x] 3.1 将 metrics、alerts、actions 稳定文档迁至 `mist-monitoring/docs/`
- [x] 3.2 合并 contracts README 的当前说明并更新 stable spec、README 与 package tests 引用

## 4. 一致性与回归验证

- [x] 4.1 验证四份 fixture、四份 sidecar 和 canonical SHA 完全一致
- [x] 4.2 确认 archive 之外没有旧顶层 `contracts/` 路径引用或残留目录
- [x] 4.3 运行 backend、datasource、deploy、monitoring 针对性 contract tests
- [x] 4.4 运行各受影响仓库的 lint/typecheck/tests 与 OpenSpec strict validation
- [x] 4.5 记录不需要 Windows HIL 的依据和完整验证结果
