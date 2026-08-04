# 2026-08-03 Shadow HIL 准备记录

## 结论

任务 5.4 的自动化 harness 和生产审批 workflow 已准备完成，但今天没有交易时段真实输出，因此
本记录不是 TDX/QMT HIL 通过证据，任务 5.4 与 5.5 继续保持未完成。

## 新增能力

- `mist-deploy` commit `61c3d30`：新增
  `Run Windows Realtime Candle Shadow HIL`、PowerShell harness、contract test 和中文 runbook。
- `mist-deploy` commit `82c33ef`：让 candle HIL 与现有 subscription HIL/dual-source soak 共用
  `mist-production-realtime-subscription-hil` concurrency group。TDX/QMT 运行和其他 realtime HIL
  不能同时重启共享 backend/Redis。
- `mist-datasource` commit `332ae19`：把 terminal owner 已保存但 TDX health 未暴露的
  `bridgeArtifactSha256` 加入 typed health 与 OpenAPI。否则 TDX HIL 只能接收用户输入的 digest，无法
  与实际运行 bridge 身份比较。

Harness 不建立新订阅、不打开第二个 snapshot collector，也不写 MySQL。它通过既有 backend source
status、candle health、monitoring、精确 Redis closed-candle Hash 和 datasource
`POST /v1/bars/query` 工作。

## 自动化检查

### mist-deploy

- `pwsh-preview -NoProfile -File scripts/test-realtime-candle-shadow-hil.ps1`：通过。
- `pwsh-preview -NoProfile -File scripts/test-workflow-config.ps1`：通过。
- 新 workflow YAML 解析：通过。
- `git diff --check`：通过。

### mist-datasource

- TDX health/gateway/OpenAPI/V1/WS 定向测试：87 个通过，只有 1 条既有 Starlette deprecation
  warning。
- 受影响文件 `ruff check`：通过。
- `scripts/export_openapi.py --all` 后 stored OpenAPI contract tests：通过。
- `git diff --check`：通过。

## 正式 HIL 行为

每个 source 单独运行，输入精确 `securityId`、`formatCode`、provider symbol、backend/datasource/
monitoring image SHA、terminal bridge build ID 与 artifact SHA-256。

`preflight_only=true` 只读验证运行身份、allowlist、`shadow`、AOF/noeviction 和 monitoring，不等待 K、
不重启服务。`preflight_only=false` 仅在上海支持交易窗口运行，并执行：

1. 保存六张受保护 MySQL 表摘要；
2. 观察至少两根新 sealed 1m candle，核验规范量额和 `amount/volume ∈ [low,high]`；
3. 重启 backend，验证 sealed record 不变和 bounded recovery gap；
4. 重启 realtime Redis，验证 AOF 恢复后 sealed record 不变；
5. 等待下一根完整 candle；
6. 调用同源 datasource historical read boundary 保存有界对照；
7. 要求受保护表前后摘要完全一致。

QMT evidence 通过 `source=qmt + fixed adapter contract` 记录 provider-float observable-value
precision provenance；不会把 precision 作为每根 snapshot/candle 的可变字段。historical
provider-native quantity 单位不在本 change 中猜测或转换。

## 后续门禁

1. 将四个候选分支发布并部署精确 SHA，生产默认保持 `off`。
2. 经审批把 HIL 窗口显式切到 `shadow`，分别运行 TDX/QMT preflight。
3. 在支持交易时段分别运行 TDX/QMT full HIL；任一失败均保持 `shadow/off`，不得切 `on`。
4. 下载两份 JSON 与 protected digest artifacts，逐项审核 grace、queue、due lag、record bytes、
   Redis used memory/AOF growth、discard 和 recovery gap。
5. 未自然出现的异常保持 `not-observed` 并链接 `capture-realtime-provider-anomalies`；不主动制造。
6. 项目负责人接受两源结果后，才可完成 5.4、5.5 并讨论归档。
