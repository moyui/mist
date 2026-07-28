## 1. Datasource image

- [x] 1.1 Add a production, non-root, read-only-compatible datasource Docker image and build context exclusions
- [x] 1.2 Add container entrypoint smoke tests for independent TDX and QMT applications
- [x] 1.3 Add CI that tests, builds and publishes the datasource image with immutable commit identity

## 2. Docker appliance topology

- [x] 2.1 Add independent `tdx-datasource` and `qmt-datasource` services, loopback port bindings, health checks and QMT state bind
- [x] 2.2 Route backend, Chan and monitoring to datasource Compose service DNS
- [x] 2.3 Require and record an explicit datasource image tag and resolved digest in Windows deployment history

## 3. Windows operations and migration

- [x] 3.1 Replace local WinSW datasource operations with source-scoped Docker Compose operations
- [x] 3.2 Implement fail-closed preflight for TDX port `17709`, loopback ports and QMT journal bind/fsync/checksum
- [x] 3.3 Implement transactional stop, container acceptance, legacy service uninstall and repair-forward diagnostics
- [x] 3.4 Remove WinSW installers, service definitions and WinSW-specific workflow paths without deleting state or evidence

## 4. Contracts and operator guidance

- [x] 4.1 Update Windows deployment workflows and runbooks for datasource image and state inputs
- [x] 4.2 Update health, diagnostics, smoke and baseline evidence tooling for both datasource containers and terminal bridge identities
- [x] 4.3 Add migration and recovery tests covering failed preflight, failed pre-removal acceptance, successful removal and post-removal repair-forward
- [x] 4.4 Remove one-time WinSW cutover inputs from the routine deployment path after production removal evidence is frozen
- [x] 4.5 Fail routine deployment when an enabled backend source cannot reach
  the current datasource WebSocket contract; require internal
  `connected=true,ready=true` and exclude only an explicitly `off` source

## 5. Verification

- [x] 5.1 Run datasource lint, type checks, non-live tests and image entrypoint smoke
- [x] 5.2 Run Compose/workflow/PowerShell contract tests and strict OpenSpec validation
- [x] 5.3 Capture Windows preflight, cutover, journal recovery and WinSW-absence evidence
  - Evidence: `mist-deploy` run `30264703822`; datasource image `2c78f03563df371c11c5e895025444dc14e11b35`, digest `sha256:e0b0f0ee96b7cfd05c2706424f60651bee4ab27ede5a73f0b289ee343619edfc`, repair-forward evidence `E:\quant\MistDocker\diagnostics\datasource-cutover-20260727-200932`
- [ ] 5.4 Use the shared
  `mist-deploy/docs/runbooks/realtime-native-subscription-joint-acceptance.md`
  entry, its off-session checklist and the
  `migrate-qmt-realtime-to-native-subscription` trading-session runbook to
  capture TDX/QMT realtime HIL plus datasource container IDs, pinned image
  tag/digest, QMT bind mount, WinSW absence, Compose DNS, TDX `17709`,
  source-scoped QMT/TDX restart isolation, journal/checkpoint continuity,
  bridge re-registration, protected-table digest and joint soak evidence; keep
  separate pass/partial/blocked verdicts for both changes in one sanitized
  manifest
  - 2026-07-28 partial evidence: deploy `30329944621` pinned datasource
    `333830977c1b3a1c6e2bf5437a2819cbb8094b6a` at digest
    `sha256:75df301e77db8fe1b9ef5c1089e3aaaf2d7be1fd67b4d4a3b59bd1bcb26f1947`.
    TDX restart isolation `30323653971` passed on the preceding candidate;
    the later datasource delta was QMT-only. QMT recovery
    `30330469662/30330585275` durably cleared retained handles and proved an
    empty registry, then QMT restart isolation `30330637703` recreated only
    `qmt-datasource`, preserved unrelated containers and kept journal SHA
    `7278121a...85bc`. Protected pre-digest `30330711987` fixed the current
    six-table baseline. The containerization verdict remains `partial` until
    the dual-source joint soak, matching post-digest and final sanitized
    manifest review are complete.
  - [x] Pinned datasource image/tag/digest, two healthy Compose containers,
    QMT bind, WinSW absence, Compose DNS and TDX
    `host.docker.internal:17709`.
  - [x] TDX source-scoped restart isolation, unrelated-container stability,
    QMT journal checksum continuity and bridge re-registration.
  - [x] Protected pre/post digest equality for the preceding HIL window's six
    protected tables.
  - [x] QMT cleanup followed by source-scoped restart isolation with an empty
    registry.
  - [ ] Dual-source container/bridge/journal/realtime joint soak.
  - [ ] Current protected post-digest matches pre-digest run `30330711987`.
  - [ ] Final sanitized manifest review with separate verdicts for both
    changes.
