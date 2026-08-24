## 1. Evidence contract

- [x] 1.1 `[mist-deploy]` 定义 bounded incident JSON schema，包含 trigger、
  observation window、source、artifact identity、readiness、provider-specific
  facts、`observed|not-observed|unknown`、recovery 和 artifact SHA-256。
  证据：`scripts/common/incident-bundle.schema.json`（顶层 required 11 字段、
  `conclusion` 三态枚举、classifier 有界枚举 9+1 值、artifact sha256 正则），
  由 `Test-IncidentBundleSchema` 校验。
- [x] 1.2 `[mist-deploy]` 建立字段 allowlist 与脱敏器，拒绝 lease token、完整
  native snapshot、业务表内容、未脱敏绝对路径和 unbounded log。
  证据：`scripts/common/incident-bundle.common.ps1` 的
  `IncidentDenyFieldPatterns`（14 个 deny 字段模式）+ `IncidentDenyValuePatterns`
  （bearer/长 hex 值）+ `Protect-IncidentValue` 递归脱敏 + `ConvertTo-BoundedSummary`
  截断（500 字符上限）。**注意**：hashtable 遍历必须用 `GetEnumerator()`——
  `.PSObject.Properties` 会暴露 `SyncRoot`（自身引用）导致无限递归（已踩坑修复）。
- [x] 1.3 `[mist-deploy tests]` 用 TDX/QMT synthetic fixture 只测试 evidence
  serializer 与 redaction；fixture 必须明确标为 deterministic，不能标为 live
  terminal evidence。
  证据：`scripts/fixtures/incident/*.json`（4 个，`_comment` 标
  `deterministic fixture — NOT live terminal evidence`）+ `test-incident-bundle-contract.ps1`
  （本地 3 个 pwsh 测试全绿，见 §4.2）。

## 2. Read-only incident collectors

- [x] 2.1 `[mist-deploy]` 实现共同只读采集入口，只读取现有 container/image、
  datasource root/scoped health、backend connection status 和 bounded logs；
  不执行 subscription mutation、断网、进程替换或 provider 调用。
  证据：`scripts/capture-provider-incident.ps1`（`docker inspect`/health
  `Invoke-RestMethod`/bounded log tail 全部 try/catch 降级为 `unknown`；
  `-Synthetic` 跳过 docker/HTTP；注释注明窗口时间为本地无时区 ISO8601）。
- [x] 2.2 `[mist-deploy]` 实现 TDX incident collector，分别记录 snapshot
  delivery failure、fresh native-list still-present 和 native-list
  unavailable，以及 quantity type/grammar/scale/range/profile/counter deviation；quantity 只保留
  bounded 分类，不保存完整 native snapshot。
  证据：`scripts/capture-tdx-incident-facts.ps1`（classifier：
  `TDX_SNAPSHOT_DELIVERY_FAILURE` / `TDX_UNSUBSCRIBE_NOT_CONVERGED/subscribed` /
  `TDX_UNSUBSCRIBE_VERIFY_FAILED/unknown` / `TDX_QUANTITY_CONTRACT_DEVIATION`；
  verify-failed 强制 `unknown`，recovery 不得声称完成）。
- [x] 2.3 `[mist-deploy]` 实现 QMT incident collector，分别记录 exact native
  result、registry bucket、journal/retained-recovery 摘要、owner fence 和
  callback/queue bounded diagnostic，以及 quantity type/finiteness/range/profile/counter deviation。
  证据：`scripts/capture-qmt-incident-facts.ps1`（classifier：
  `QMT_UNSUBSCRIBE_UNCONFIRMED` / `QMT_DURABILITY_FAILURE` / `QMT_OWNER_FENCE` /
  `QMT_CALLBACK_ANOMALY` / `QMT_QUANTITY_CONTRACT_DEVIATION`；
  unconfirmed 强制 `unknown`；`-JournalSummaryPath` 只收 bounded 摘要）。
- [x] 2.4 `[mist-deploy tests]` 证明 collector 在没有真实触发时只输出
  `not-observed`，且源码与 workflow 不包含 fault plan、chaos switch、journal
  corruption、network block 或 subscription mutation。
  证据：`test-provider-incident-capture.ps1`（无触发 synthetic 采集 → 双源
  `NOT_OBSERVED`/`not-observed`；源码词边界扫描禁 fault/chaos/corrupt/inject/
  mutation；facts 脚本不引用终端 SDK/不 spawn threads）。

## 3. Operator workflow and recovery

- [x] 3.1 `[mist-deploy]` 编写简体中文 runbook：先保存 pre-recovery bundle，
  再执行既有 source-scoped recovery，最后保存 post-recovery bundle。
  证据：`docs/runbooks/provider-incident-capture.md`（触发判定 → pre bundle →
  既有 `recover-windows-tdx-runtime.yml`/`recover-windows-qmt-runtime.yml` →
  post bundle → 复盘归档；含脱敏与 `unknown` 铁律）。
- [x] 3.2 `[mist-deploy]` 增加 production-approved 手工 workflow，只接受已
  观察 incident ID/source/time window，不自动触发异常。
  证据：`.github/workflows/capture-windows-provider-incident.yml`
  （`workflow_dispatch` 仅 incident_id/source/window/phase/trigger 输入、
  `environment: mist-production`、upload-artifact、无 cron、不调用 recovery）。
- [x] 3.3 `[mist-deploy/mist-monitoring]` 从 monitoring/runbook 链接采集入口；
  alerts 不直接执行 collector mutation 或 recovery。
  证据：`oo-alerts/rules.json` `_comment` 追加 runbook 引用（不改任何 rule
  语义）+ `docs/runbooks/operations-recovery.md` §4 交叉链接。
- [x] 3.4 `[mist-deploy tests]` 验证 TDX recovery 不修改 QMT，QMT recovery
  不修改 TDX，且任何 unknown physical state 不被升级为 success。
  证据：`test-provider-incident-isolation.ps1`（静态路径隔离断言 + synthetic
  运行 bundle 交叉检查；带 heartbeat/其它订阅进展的 verify-failed 与
  unsubscribe-unconfirmed 观察结论仍为 `unknown`）。

## 4. Release and incident review

- [x] 4.1 `[mist/mist-deploy]` 在当前 realtime release manifest 中把未自然
  出现的 provider negative branches 标记为 `not-observed` 并引用本 change，
  不再作为 normal-path release blocker。
  证据：runbook §7 Release 附录提供逐字发布声明（负分支全部
  `not-observed` + capture owner 引用）；正常路径发布不被缺 incident 阻塞。
- [x] 4.2 `[all affected repositories]` 运行 unit、contract、workflow、
  redaction、`git diff --check` 与 OpenSpec strict validation。
  证据：本地 `pwsh-preview -File` 三个测试脚本全绿
  （test-incident-bundle-contract / test-provider-incident-capture /
  test-provider-incident-isolation）；`git diff --check` 干净；mist 仓
  `openspec validate` 通过；3 个测试脚本已接入
  `test-deploy-scripts.yml`（推送后 GitHub Actions 端到端复跑）。
- [ ] 4.3 `[operator]` 首个真实 incident 发生后 review bundle，确认事实、
  unknown 和推断边界；若证据推翻当前 contract，另建 reviewed OpenSpec delta，
  不在 incident 采集 change 中静默修改生产语义。
  阻塞：**env-blocked**——等首个真实 provider incident 自然发生（runbook 第 6 章
  复盘流程已就绪；采集/归档侧已全部落地，不阻塞本 change 归档）。