## Context

The Windows production machine currently runs the Mist application stack in
Docker Desktop while two Python datasource gateways are installed and operated
through WinSW. Native terminal access has since moved behind TDX and QMT builtin
bridge scripts: the datasource gateways expose platform-neutral HTTP/WebSocket
control planes, and the Windows terminal processes poll those gateways through
loopback.

The remaining host-service split duplicates deployment, Python runtime,
logging, health and recovery mechanisms. QMT additionally owns a durable
subscription journal that must survive process and container replacement. TDX
history/reference calls still depend on the official Windows HTTP endpoint at
port `17709`.

## Goals / Non-Goals

**Goals:**

- Run TDX and QMT datasource gateways as independently restartable services in
  the existing Windows Docker Compose appliance.
- Use one immutable datasource image and pin its production identity.
- Preserve host-loopback bridge URLs and all public datasource wire contracts.
- Preserve QMT journal durability across container recreation.
- Remove both WinSW services and their host Python runtime after a gated,
  transactional cutover.
- Make deployment, health, diagnostics and baseline evidence Docker-native.

**Non-Goals:**

- Containerizing the TDX or QMT desktop terminal, native SDK, or builtin bridge.
- Adding a Windows port proxy when the official TDX HTTP endpoint is not
  reachable from Docker Desktop.
- Changing realtime ownership, lease, command or frame schemas.
- Providing a post-cutover WinSW rollback mode.

## Decisions

### One image, two Compose services

`ghcr.io/mist-trade/mist-datasource` contains both Python applications. Compose
starts `tdx.main:app` and `qmt.main:app` as separate services so health,
restart, mode selection and failure containment remain source-local. A combined
process would reduce service count but couple source availability and recovery.

### Loopback publication and internal service discovery

Compose publishes TDX as `127.0.0.1:9001:9001` and QMT as
`127.0.0.1:9002:9002`. Terminal bridges therefore retain their current
loopback URLs without exposing datasource control surfaces to the LAN.
`mist-backend`, `chan-api` and monitoring use Compose service DNS rather than
host hairpin URLs.

Routine deployment also treats backend-to-datasource WebSocket readiness as an
image-pair compatibility gate. For each source whose effective mode is
`builtin`, the running backend's internal source status must exist and report
`connected=true, ready=true`. Container health and datasource HTTP reachability
alone are insufficient: an older backend can remain HTTP-healthy while retrying
a removed WebSocket path indefinitely. A source explicitly set to `off` is
excluded from this gate.

Docker NAT presents Windows-originated loopback-published connections as the
container's default gateway peer. Container mode explicitly trusts only that
exact default-gateway address in addition to native loopback; arbitrary bridge
network peers remain rejected. This preserves the local-only policy without
changing bridge request schemas.

### Windows TDX dependency is a fail-closed preflight

The TDX container uses `TDX_HTTP_URL=http://host.docker.internal:17709/`.
Before any legacy service is stopped, a disposable container MUST prove the
official endpoint is reachable. Failure blocks the migration. A portproxy was
rejected because it would leave an additional Windows runtime component and
hide an unsupported TDX bind configuration.

### QMT state stays on the Windows data drive

Compose bind-mounts `${MIST_DATASOURCE_STATE_DIR}\qmt` at
`/var/lib/mist-datasource/qmt` and sets
`MIST_QMT_SUBSCRIPTION_JOURNAL_PATH` explicitly. Deployment verifies existing
journal/checkpoint readability, writable-directory fsync and a before/after
checksum. The image root filesystem is read-only; only the state mount and
tmpfs locations are writable.

### Transactional removal, then repair-forward

The cutover first records legacy service definitions, runtime refs, logs,
bridge identities and journal checksum. It then stops—but does not yet
uninstall—WinSW, starts the containers and runs acceptance checks. Only after
both datasource services pass does the same operation uninstall/delete both
Windows services and remove WinSW/runtime artifacts.

The stopped interval is transaction safety, not a supported rollback state.
After deletion, failures are repaired by replacing or reconfiguring the
containers. Journal, archived logs and evidence are never deleted with the
legacy runtime.

After the successful cutover evidence is frozen, `Deploy Windows Mist Stack`
enters steady state: it starts and verifies the datasource Compose services
directly and no longer exposes `datasource_root` or `remove_legacy_winsw`.
The idempotent migration script remains a separate audit/repair-forward tool
for an exceptional machine that has not completed the cutover.

### Image and deployment identity are explicit

Production workflows require a datasource image tag other than `latest` and
record both the requested tag and resolved image digest. Compose, deploy
history and evidence use the same identity. Terminal bridge installed paths,
SHA-256 and runtime build IDs remain separately recorded because deploying the
container does not deploy bridge scripts.

## Risks / Trade-offs

- [TDX port `17709` is loopback-only] → Block before stopping WinSW and require
  a supported TDX listener configuration; do not synthesize a proxy.
- [Port `9001` or `9002` remains held after service stop] → Require verified
  port release before starting Compose and abort cleanup on failure.
- [QMT journal mount is wrong or not durable] → Test read/write/fsync and
  checksum before cutover; reject anonymous volumes and missing bind paths.
- [Container restart loses terminal ownership] → Keep bridge-first,
  fail-closed readiness and require owner re-registration/reload evidence.
- [Backend and datasource images expose different WebSocket generations] →
  Fail routine deployment unless each enabled source reports backend
  `connected/ready` through the current datasource route; retain both image
  identities and recent logs in diagnostics.
- [No WinSW rollback after deletion] → Gate deletion on the complete
  container acceptance suite and retain immutable diagnostics for
  repair-forward.
- [Docker Desktop outage affects more services] → Preserve separate restart
  policies and source-local service operations; document Docker Desktop as a
  single production dependency.

## Migration Plan

1. Build, test, publish and digest-pin the datasource image.
2. Render Compose and preflight image entrypoints, loopback ports, free disk,
   QMT state bind/fsync and container-to-host TDX `17709`.
3. Capture legacy service configuration, deployed refs, logs, journal digest,
   terminal bridge path/SHA/build and protected-table digest.
4. Stop both WinSW services, verify ports are free, start both datasource
   containers and wait for service health and bridge owner registration.
5. Run history/reference, control-plane, restart recovery, monitoring and
   protected-table acceptance checks.
6. Uninstall/delete both WinSW services and remove their executable, XML,
   virtual environment and obsolete runtime checkout. Preserve state and
   evidence.
7. Repeat health, journal and digest checks. Subsequent failure recovery is
   container repair-forward only.
8. Complete a supported trading-session HIL and soak before archiving the
   change. This uses the same maintenance window, protected pre/post digest and
   sanitized manifest as `migrate-qmt-realtime-to-native-subscription`, while
   keeping separate Docker-deployment and subscription-transport verdicts.
   The shared run records container/image/mount/WinSW-absence and Compose-DNS
   evidence, then restarts QMT and TDX containers one at a time after mutation
   cleanup and proves the other datasource and app containers were not
   recreated.

## Open Questions

None. Container reachability to TDX `17709` is an execution gate rather than an
alternative architecture decision.
