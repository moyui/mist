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

## 5. Verification

- [x] 5.1 Run datasource lint, type checks, non-live tests and image entrypoint smoke
- [x] 5.2 Run Compose/workflow/PowerShell contract tests and strict OpenSpec validation
- [x] 5.3 Capture Windows preflight, cutover, journal recovery and WinSW-absence evidence
  - Evidence: `mist-deploy` run `30264703822`; datasource image `2c78f03563df371c11c5e895025444dc14e11b35`, digest `sha256:e0b0f0ee96b7cfd05c2706424f60651bee4ab27ede5a73f0b289ee343619edfc`, repair-forward evidence `E:\quant\MistDocker\diagnostics\datasource-cutover-20260727-200932`
- [ ] 5.4 Capture supported-session TDX/QMT realtime HIL, protected-table digest and soak evidence
