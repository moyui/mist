## MODIFIED Requirements

### Requirement: Provider-local common names expose matching responsibilities

The maintained backend and datasource source trees SHALL use matching provider-local paths for responsibilities shared by TDX and QMT. Guards SHALL validate real interfaces and behavior, not only matching filenames.

#### Scenario: Backend provider directories are inspected

- **WHEN** structure guards compare `sources/tdx` and `sources/qmt`
- **THEN** shared realtime client, control, types, decoder, health and module responsibilities MUST use the agreed matching paths
- **AND** every declared counterpart MUST export the expected callable interface
- **AND** provider-local runtime stores MUST expose aligned connection/freshness
  responsibilities without a sequence-fence interface

#### Scenario: Datasource provider directories are inspected

- **WHEN** structure guards compare datasource TDX and QMT packages
- **THEN** shared provider, realtime runtime, control, contract, route, client and health responsibilities MUST use matching paths
- **AND** empty files, stubs or unconditional success implementations MUST fail

### Requirement: Layout normalization preserves external behavior

Layout alignment SHALL preserve every behavior outside this focused change.
This change adds QMT callback subscription, unified dual-source schema v2 and
subscription control parity, while QMT history remains unchanged. TDX native
acquisition remains unchanged, but its bridge→datasource snapshot request
removes producer retry/dedup state and its datasource→backend frame moves to
the unified schema.

#### Scenario: TDX implementation is aligned

- **WHEN** TDX files or interfaces are adjusted for parity
- **THEN** existing TDX native acquisition MUST remain unchanged
- **AND** `/tdx/bridge/snapshot` MUST remove `producerSequence`, automatic
  snapshot retry, producer-sequence dedup and success item ack/sequence across
  bridge, route, gateway, tests and documentation
- **AND** `/tdx/bridge/poll|result` control behavior MUST remain unchanged
- **AND** datasource MUST wrap the separate TDX `symbol` and flat native object
  as one schema-v2 native-map entry
- **AND** active schema-v1 frame, adapter and epoch/per-symbol sequence fence
  MUST be removed after the cutover

#### Scenario: QMT history files have prior names

- **WHEN** QMT paths are audited or moved
- **THEN** rename-aware Git history MUST be used to locate former bridge/history filenames
- **AND** existing historical command/result capability MUST remain intact

#### Scenario: Formal frame behavior is compared

- **WHEN** layout guards compare the post-change provider implementations
- **THEN** both providers MUST use the same exact schema-v2 envelope
- **AND** both MUST expose provider-symbol-keyed `data.native`
- **AND** a source-specific formal-frame version difference MUST fail the guard

## ADDED Requirements

### Requirement: Subscription capability parity is checked in code

Both TDX and QMT datasource implementations SHALL support
`sync_subscriptions`, `subscribe`, `unsubscribe` and `get_subscriptions`.
Both Mist provider clients SHALL expose matching
`syncSubscriptions`, `subscribe`, `unsubscribe` and `getSubscriptions`
Nest-internal methods through one common interface. This parity SHALL not depend
on a dynamic protocol capability advertisement, and the methods SHALL not imply
that a production caller exists in this change.

#### Scenario: Capability guard runs

- **WHEN** the provider implementations are loaded in tests
- **THEN** all four datasource operations and all four Mist client methods MUST
  exist, validate their exact request shape and return the simple
  success-or-failure response
- **AND** the guard MUST fail when any implementation is absent
- **AND** a client method that does not send and match the provider WebSocket
  request/response MUST fail the guard

#### Scenario: Ready message is inspected

- **WHEN** a provider connects to backend
- **THEN** readiness MUST represent the build's complete control implementation
- **AND** no dynamic capability array is required
- **AND** ready, open or reconnect MUST NOT itself invoke a control method

#### Scenario: Product caller surface is inspected

- **WHEN** layout and import guards inspect controllers, frontend routes,
  commands, schedulers and lifecycle hooks
- **THEN** this change MUST contain no production subscription mutation caller
- **AND** test-only direct invocation MUST remain clearly separated from the
  application runtime graph

### Requirement: Provider-only mechanisms remain explicit exceptions

Layout parity SHALL not force provider-native mechanisms into identical files or wire schemas. Every provider-only responsibility SHALL be listed in the layout manifest with its owner and verification.

#### Scenario: QMT-only responsibilities are inspected

- **WHEN** the manifest is checked
- **THEN** QMT whole/single handle registry, subscription JSONL journal, Python 3.6 callback queue and `/qmt/bridge/subscriptions/*` routes MUST be explicit QMT-only entries

#### Scenario: TDX-only responsibilities are inspected

- **WHEN** the manifest is checked
- **THEN** TDX official HTTP RPC list/unsubscribe and flat-native `symbol`
  bridge snapshot extension MUST be explicit TDX-only entries
- **AND** this change MUST not require a QMT-style ID registry in TDX

#### Scenario: Native frame shapes are compared

- **WHEN** frame contracts are inspected
- **THEN** both providers MUST use the same outer `type/provider/timestamp` routing fields
- **AND** both MUST use exact `data{schemaVersion:2,capturedAt,native}`
- **AND** QMT MUST preserve its one/multi-code callback map
- **AND** TDX MUST wrap its separate bridge-layer symbol and flat native object
  as one map entry without mutating native

### Requirement: Source converters are aligned but independent

TDX and QMT SHALL each own one new `native-snapshot.converter.ts` in the same
relative provider directory. Alignment SHALL cover responsibility and function
shape, not provider-field implementation.

#### Scenario: Converter counterparts are checked

- **WHEN** layout guards inspect TDX and QMT realtime conversion
- **THEN** both source directories MUST contain an implemented
  `native-snapshot.converter.ts` with fixture-backed unit tests
- **AND** each MUST accept resolved `securityId`, `providerSymbol`,
  `capturedAt` and one native object
- **AND** the common realtime directory MUST own the single schema-v2
  native-map envelope decoder and canonical type

#### Scenario: Converter dependencies are checked

- **WHEN** dependency guards inspect the new converters and realtime clients
- **THEN** they MUST NOT import the former `realtime-native.adapter.ts`
- **AND** they MUST NOT import one another or a generic provider-native mapping layer
- **AND** sharing the common schema-v2 envelope decoder, canonical type and
  ingress interface MUST remain allowed

#### Scenario: Runtime store counterparts are checked

- **WHEN** layout guards inspect TDX and QMT realtime runtime stores
- **THEN** both MUST retain aligned connection, readiness, owner/build,
  accepted-time and bounded rejection responsibilities
- **AND** neither MUST export formal epoch/sequence comparison, duplicate
  rejection or a second full canonical snapshot store
- **AND** active clients and stores MUST NOT depend on
  `RealtimeSymbolSequenceFence`

#### Scenario: Diagnostics resolve canonical identity

- **WHEN** a provider diagnostic reads one provider symbol
- **THEN** its provider-local allowlist MUST resolve the corresponding
  `securityId`
- **AND** the diagnostic MUST combine the common latest snapshot with the
  provider runtime state
- **AND** matching directory names MUST NOT justify separate canonical latest stores
