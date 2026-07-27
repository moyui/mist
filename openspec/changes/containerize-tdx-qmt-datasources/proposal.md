## Why

TDX and QMT datasource gateways no longer require their Python services to run
as Windows host services because terminal-native access is isolated behind the
builtin bridges. Running the gateways in the existing Docker appliance removes
the duplicated WinSW lifecycle, Python environment, logging and deployment path
while preserving the terminal bridge boundary.

## What Changes

- Add one production `mist-datasource` image with independent TDX and QMT
  service entrypoints in the existing Windows Docker Compose stack.
- Keep the TDX and QMT terminal clients and builtin bridge scripts on Windows;
  publish datasource ports only on Windows loopback so those bridges continue
  to use `127.0.0.1:9001` and `127.0.0.1:9002`.
- Route Docker services to datasource Compose service names and route the TDX
  gateway to the Windows official TDX HTTP service through
  `host.docker.internal:17709`.
- Persist QMT subscription journal state through an explicit Windows bind mount.
- **BREAKING**: remove both datasource WinSW services, installers, service
  definitions and host Python runtime deployment after the container cutover
  passes its transactional acceptance gates. There is no WinSW rollback path
  after removal.
- Replace hybrid health, diagnostics, deployment and baseline evidence with
  Docker-native datasource operations while retaining separately recorded
  terminal bridge installed-path and SHA evidence.

## Capabilities

### New Capabilities

- `datasource-container-deployment`: Defines the datasource image, two-service
  Compose topology, persistent state, preflight, transactional cutover and
  repair-forward operating model.

### Modified Capabilities

- `windows-docker-appliance`: Replaces host WinSW datasources with independent
  Docker services and Docker-native operations, health and diagnostics.
- `mist-production-baseline`: Replaces hybrid WinSW evidence with pinned
  datasource image, container health, terminal bridge and persistent journal
  evidence.

## Impact

The change affects `mist-datasource` image construction and CI,
`mist-deploy` Compose/workflows/PowerShell operations, the Windows production
runbook and the two modified OpenSpec capabilities. Public datasource HTTP and
WebSocket contracts and terminal bridge wire schemas do not change. Production
cutover requires Docker Desktop reachability to the Windows TDX HTTP port and a
maintenance window for removing the legacy services.
