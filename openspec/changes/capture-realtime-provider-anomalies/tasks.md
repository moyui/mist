## 1. Evidence contract

- [ ] 1.1 `[mist-deploy]` 定义 bounded incident JSON schema，包含 trigger、
  observation window、source、artifact identity、readiness、provider-specific
  facts、`observed|not-observed|unknown`、recovery 和 artifact SHA-256。
- [ ] 1.2 `[mist-deploy]` 建立字段 allowlist 与脱敏器，拒绝 lease token、完整
  native snapshot、业务表内容、未脱敏绝对路径和 unbounded log。
- [ ] 1.3 `[mist-deploy tests]` 用 TDX/QMT synthetic fixture 只测试 evidence
  serializer 与 redaction；fixture 必须明确标为 deterministic，不能标为 live
  terminal evidence。

## 2. Read-only incident collectors

- [ ] 2.1 `[mist-deploy]` 实现共同只读采集入口，只读取现有 container/image、
  datasource root/scoped health、backend connection status 和 bounded logs；
  不执行 subscription mutation、断网、进程替换或 provider 调用。
- [ ] 2.2 `[mist-deploy]` 实现 TDX incident collector，分别记录 snapshot
  delivery failure、fresh native-list still-present 和 native-list
  unavailable，以及 quantity type/grammar/scale/range/profile/counter deviation；quantity 只保留
  bounded 分类，不保存完整 native snapshot。
- [ ] 2.3 `[mist-deploy]` 实现 QMT incident collector，分别记录 exact native
  result、registry bucket、journal/retained-recovery 摘要、owner fence 和
  callback/queue bounded diagnostic，以及 quantity type/finiteness/range/profile/counter deviation。
- [ ] 2.4 `[mist-deploy tests]` 证明 collector 在没有真实触发时只输出
  `not-observed`，且源码与 workflow 不包含 fault plan、chaos switch、journal
  corruption、network block 或 subscription mutation。

## 3. Operator workflow and recovery

- [ ] 3.1 `[mist-deploy]` 编写简体中文 runbook：先保存 pre-recovery bundle，
  再执行既有 source-scoped recovery，最后保存 post-recovery bundle。
- [ ] 3.2 `[mist-deploy]` 增加 production-approved 手工 workflow，只接受已
  观察 incident ID/source/time window，不自动触发异常。
- [ ] 3.3 `[mist-deploy/mist-monitoring]` 从 monitoring/runbook 链接采集入口；
  alerts 不直接执行 collector mutation 或 recovery。
- [ ] 3.4 `[mist-deploy tests]` 验证 TDX recovery 不修改 QMT，QMT recovery
  不修改 TDX，且任何 unknown physical state 不被升级为 success。

## 4. Release and incident review

- [ ] 4.1 `[mist/mist-deploy]` 在当前 realtime release manifest 中把未自然
  出现的 provider negative branches 标记为 `not-observed` 并引用本 change，
  不再作为 normal-path release blocker。
- [ ] 4.2 `[all affected repositories]` 运行 unit、contract、workflow、
  redaction、`git diff --check` 与 OpenSpec strict validation。
- [ ] 4.3 `[operator]` 首个真实 incident 发生后 review bundle，确认事实、
  unknown 和推断边界；若证据推翻当前 contract，另建 reviewed OpenSpec delta，
  不在 incident 采集 change 中静默修改生产语义。
