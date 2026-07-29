## Why

The managed MySQL schema still mixes camelCase and snake_case physical column
names across the K, provider-extension, and source-configuration tables. The
system has not entered production use, so this is the lowest-risk point to
finish the physical naming boundary while preserving TypeScript and
provider-native contracts.

## What Changes

- **BREAKING** Rename all 26 remaining managed camelCase physical columns to
  snake_case with forward-only migration 010.
- Keep TypeScript entity properties, API JSON fields, and provider-native
  payload keys in their existing contracts; add explicit TypeORM column names.
- Update the realtime allowlist raw SQL and current operational audits to use
  the new physical names.
- Add pre/post schema audit evidence and verify that row values, K natural-key
  uniqueness, extension one-to-one ownership, and provider routing survive the
  rename.
- Preserve migrations 001–009 byte-for-byte.

## Capabilities

### New Capabilities

- `managed-database-column-naming`: Defines the complete TypeScript-to-MySQL
  naming map and the no-camelCase physical-column invariant.

### Modified Capabilities

- `database-schema-safety`: Requires the forward-only rename migration,
  migration-history immutability, and schema/data/constraint verification.

## Impact

- Database tables: `security_source_configs`, `k`, `k_extensions_ef`,
  `k_extensions_tdx`, and `k_extensions_qmt`.
- Backend entities under `libs/shared-data/src/entities/`.
- Realtime allowlist raw query and its tests.
- Database audits, migration documentation, schema-safety tests, and root
  database review documents.
- No HTTP, WebSocket, TypeScript property, DTO, or provider-native field is
  renamed.
