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
  the current datasource WebSocket contract; require backend
  `connected=true,transportReady=true`, independently require direct datasource
  scoped bridge `ready=true` with owner identity, and exclude only an explicitly
  `off` source. Do not use backend-cached bridge state as authority.

## 5. Verification

- [x] 5.1 Run datasource lint, type checks, non-live tests and image entrypoint smoke
- [x] 5.2 Run Compose/workflow/PowerShell contract tests and strict OpenSpec validation
- [x] 5.3 Capture Windows preflight, cutover, journal recovery and WinSW-absence evidence
  - Evidence: `mist-deploy` run `30264703822`; datasource image `2c78f03563df371c11c5e895025444dc14e11b35`, digest `sha256:e0b0f0ee96b7cfd05c2706424f60651bee4ab27ede5a73f0b289ee343619edfc`, repair-forward evidence `E:\quant\MistDocker\diagnostics\datasource-cutover-20260727-200932`
- [x] 5.4 Use the shared
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
    `7278121a...85bc`. The current trading-session window used protected
    pre/post runs `30331886288/30334690762`; all six row counts and content
    digests matched. TDX owner soak run `30332675452` passed 35 samples but is
    source-only and did not replace the required dual-source soak. The
    final repository/contract/sanitization review is recorded in
    `off-session-final-review-2026-07-28.md/.json`. The containerization
    historical verdict remained `partial` at that checkpoint.
  - 2026-07-29 quality-governance requalification: the one-time Docker
    cutover and WinSW-removal evidence remains accepted, but the current
    datasource candidate is now
    `c8b140b07f9d053c547e1e696f5a1779d0368b12`, resolved as
    `sha256:5b844cb5add96085cd5a58de575f9029716a80ca1ad0f98f5f2af81412caac55`.
    Normal deploy run `30439521072` started both datasource containers and
    then correctly rolled back because the TDX terminal bridge owner did not
    register. Recovery run `30439986842` restarted and logged into TDX but
    likewise observed no owner. Maintenance deploy `30440335811` may correct
    the running image identity with health checks explicitly skipped; it does
    not complete this task.
  - 2026-07-30 closure: normal deploy `30517455802` pinned backend
    `b61dbc14...` and datasource `a010946...`; run `30517565814` completed the
    35-minute dual-source freshness/bridge/journal observation with HIL exit
    `0`, stable datasource identities and successful cleanup/recovery.
    Evidence-basename fix `17e4b48` was requalified by green run
    `30519530767`. Protected post-digest `30519822194` matches
    `30507681699` for all six protected tables. The sanitized joint manifest
    records this change as `pass`.
  - [x] Pinned datasource image/tag/digest, two healthy Compose containers,
    QMT bind, WinSW absence, Compose DNS and TDX
    `host.docker.internal:17709`.
  - [x] TDX source-scoped restart isolation, unrelated-container stability,
    QMT journal checksum continuity and bridge re-registration.
  - [x] Protected pre/post digest equality for the preceding HIL window's six
    protected tables.
  - [x] QMT cleanup followed by source-scoped restart isolation with an empty
    registry.
  - [x] Dual-source container/bridge/journal/realtime joint soak.
  - [x] Current protected pre/post digests
    `30331886288/30334690762` match for all six protected tables.
  - [x] Final sanitized manifest review with separate verdicts for both
    changes.
