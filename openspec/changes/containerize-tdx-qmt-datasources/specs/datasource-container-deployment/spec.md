## ADDED Requirements

### Requirement: One immutable image runs independent datasource services
The production appliance SHALL run TDX and QMT datasource gateways from the
same explicitly tagged `mist-datasource` image as independent Compose services.

#### Scenario: Production starts both datasource gateways
- **WHEN** the Windows Docker appliance starts
- **THEN** `tdx-datasource` starts `tdx.main:app` on container port `9001`
- **AND** `qmt-datasource` starts `qmt.main:app` on container port `9002`
- **AND** restarting either service does not restart the other datasource or an application service

#### Scenario: Production image identity is pinned
- **WHEN** a production datasource deployment is requested
- **THEN** the datasource image tag MUST be supplied explicitly and MUST NOT be `latest`
- **AND** deployment evidence records the requested tag and resolved image digest

### Requirement: Terminal bridges retain loopback-only datasource access
The appliance SHALL preserve the Windows terminal bridge boundary while
preventing datasource control ports from being published to the LAN.

#### Scenario: Builtin bridges connect from Windows
- **WHEN** TDX and QMT builtin bridges run inside their desktop terminals
- **THEN** TDX reaches the container through `127.0.0.1:9001`
- **AND** QMT reaches the container through `127.0.0.1:9002`
- **AND** the public bridge wire schemas remain unchanged

#### Scenario: Datasource ports are published
- **WHEN** Compose renders the datasource services
- **THEN** ports `9001` and `9002` are bound to host address `127.0.0.1`
- **AND** they are not bound to all host interfaces

#### Scenario: Docker NAT changes the bridge peer address
- **WHEN** a terminal bridge reaches a loopback-published datasource port
- **THEN** container mode accepts the exact container default-gateway peer
- **AND** native loopback remains accepted
- **AND** any other container or network peer is rejected

### Requirement: Docker services use datasource service discovery
Application containers SHALL use Compose service DNS for datasource traffic.

#### Scenario: Backend and Chan resolve datasource gateways
- **WHEN** `mist-backend` and `chan-api` start
- **THEN** TDX base URL is `http://tdx-datasource:9001`
- **AND** the backend QMT base URL is `http://qmt-datasource:9002`
- **AND** application containers do not use `host.docker.internal:9001` or `host.docker.internal:9002`

### Requirement: TDX host dependency is proven before cutover
The deployment SHALL prove the TDX container can reach the official Windows TDX
HTTP service before stopping or deleting a legacy service.

#### Scenario: Official TDX HTTP is reachable
- **WHEN** migration preflight runs
- **THEN** a disposable container calls `http://host.docker.internal:17709/`
- **AND** the result proves network reachability even when the probed method returns an application-level error

#### Scenario: Official TDX HTTP is unreachable
- **WHEN** connection to `host.docker.internal:17709` fails or times out
- **THEN** migration stops before either WinSW service is stopped
- **AND** deployment does not create a Windows port proxy or forwarding service

### Requirement: QMT subscription state survives container replacement
The QMT datasource SHALL store its subscription journal and checkpoints in an
explicit Windows bind mount.

#### Scenario: QMT service is recreated
- **WHEN** the `qmt-datasource` container is replaced
- **THEN** it reopens the same configured journal path under
  `/var/lib/mist-datasource/qmt`
- **AND** unresolved lifecycle, checkpoint and recovery state remain available

#### Scenario: State mount is not durable
- **WHEN** preflight cannot read the existing journal, write and fsync the state directory, or preserve its checksum
- **THEN** deployment fails before stopping WinSW
- **AND** it MUST NOT substitute an anonymous Docker volume

### Requirement: WinSW removal is gated and permanent
The migration SHALL remove both datasource WinSW services only after the
container deployment passes its acceptance gates and SHALL NOT retain WinSW as
a supported rollback mode.

#### Scenario: Container acceptance fails
- **WHEN** either datasource container, bridge registration, history path,
  control path, journal recovery or protected-table check fails before removal
- **THEN** the legacy services are not uninstalled or deleted
- **AND** the failure and captured diagnostics remain visible

#### Scenario: Container acceptance succeeds
- **WHEN** every pre-removal acceptance gate passes
- **THEN** the migration uninstalls and deletes both datasource Windows services
- **AND** it removes WinSW executable/XML and obsolete host Python runtime artifacts
- **AND** it preserves QMT state, archived logs and evidence

#### Scenario: Failure occurs after WinSW removal
- **WHEN** a datasource failure occurs after legacy services were deleted
- **THEN** recovery replaces or reconfigures the Docker service
- **AND** operator tooling does not reinstall or restart a WinSW datasource

### Requirement: Datasource containers are least-privilege and observable
Production datasource containers SHALL run without root privileges and expose
Docker-native health, logs and diagnostics.

#### Scenario: Compose starts a datasource container
- **WHEN** either datasource service is inspected
- **THEN** it runs as a non-root image user with a read-only root filesystem
- **AND** only declared state and temporary paths are writable
- **AND** its health status and stdout/stderr are available through Compose

#### Scenario: Operator collects datasource diagnostics
- **WHEN** the production diagnostics command runs
- **THEN** it records both datasource container states, health, recent logs,
  image IDs/digests, configured state mount and bridge readiness summaries
- **AND** it does not require WinSW service files or logs
