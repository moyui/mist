## 1. Readiness producers

- [x] 1.1 Normalize TDX root and bridge-scoped health to the common bridge health shape.
- [x] 1.2 Normalize QMT root, bridge-scoped health, and realtime ready metadata without `collectorReady`.
- [x] 1.3 Add datasource contract tests and regenerate OpenAPI for the breaking health and ready-frame shapes.

## 2. Backend consumers

- [x] 2.1 Decode common nested bridge metadata for TDX and QMT and expose protocol state as `transportReady`.
- [x] 2.2 Unify realtime store error APIs and remove unproduced or retired readiness metadata.
- [x] 2.3 Update backend contract, unit, and diagnostic tests for the new state vocabulary.

## 3. Deployment and monitoring consumers

- [x] 3.1 Update deploy health, smoke, soak, restart-isolation, and recovery scripts to the normalized paths.
- [x] 3.2 Update monitoring parsers, metrics documentation, fixtures, and tests to the normalized paths.
- [x] 3.3 Add active-source guards proving retired readiness identifiers are absent.

## 4. Internal naming and layout

- [x] 4.1 Rename approved Mist realtime utility, clock, and types/decoder files with all imports and tests while preserving the accepted symmetric source-service layout.
- [x] 4.2 Rename Chan entity files/classes to singular names while preserving explicit database table names.
- [x] 4.3 Preserve the accepted provider-specific runtime/bridge paths and give TDX market normalization a responsibility-specific name.
- [x] 4.4 Record identity, previous-close, and lifecycle timestamp compatibility boundaries without renaming database or provider-native contracts.

## 5. Audit and verification

- [x] 5.1 Rewrite the realtime/history audit with corrected counts, evidence, finding status, and the expanded naming/path inventory.
- [x] 5.2 Rewrite the reusable project quality checklist with semantic naming, field-chain, file/path, exemption, and severity requirements.
- [x] 5.3 Run strict OpenSpec, Mist, datasource, deploy, and monitoring validation and record any unrelated pre-existing failures.
- [x] 5.4 Document the atomic production switch, HIL evidence, and all-four-repository rollback procedure.
