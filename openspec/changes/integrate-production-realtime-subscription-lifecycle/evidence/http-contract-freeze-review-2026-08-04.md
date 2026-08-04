# Realtime subscription HTTP contract freeze review — 2026-08-04

## Reviewed inputs

- current shared `ApiResponseDto`, `ApiErrorDto`, `HttpResponseInterceptor` and
  `HttpBusinessRejection` behavior;
- current `SecurityV1AliasController` activate/deactivate and one-Security sources paths;
- production lifecycle proposal/design/delta specs;
- governance HTTP, error, DTO/VO, database and cross-repository fixture rules;
- independent frontend change `add-realtime-subscription-operator-ux`.

## Frozen decisions

- Initialization is an exact `mode=new|existing` discriminated union. New mode accepts canonical
  Security identity, fixed `STOCK`, exact `tdx|qmt` and `providerSymbol`; existing mode accepts only
  `securitySourceConfigId`.
- Public VO is explicitly mapped and does not expose a TypeORM entity. Database numeric status is
  mapped to `ACTIVE|SUSPENDED|DELISTED`.
- List order is `assignmentId ASC`; `afterId` is positive; limit defaults to 20 and is capped at 100.
- `sourceCapacities` always contains TDX and QMT global ACTIVE-assignment counts. Its count is not
  inferred from a page and is not schema-capped, so corrupted over-capacity state remains visible.
- `active` and provider evidence remain nullable. TDX native-list and QMT durable-registry evidence
  are separate enums; unknown is not false/zero.
- Existing activate/deactivate success remains HTTP 200 with `data=null`. Activation may instead
  return the approved HTTP-200 capacity business rejection. Deactivation never calls unsubscribe.
- Expected initialization/resource/state outcomes use HTTP 200 business rejections with fixed typed
  data. DTO validation and unknown persistence/programming failures keep real 4xx/5xx status.
- Post-commit provider failure does not roll back or rewrite successful Security/assignment
  persistence; inventory exposes convergence afterwards.
- `mqmt`, desired PATCH, raw control, assignment deletion and compatibility aliases are absent.

## Artifacts and digests

| Artifact | SHA-256 |
| --- | --- |
| `contracts/README.md` | `8e1e4e268c1b886ecc11f74e1f534c5a181f58501d33b09365c4e91fce2f7c1e` |
| `contracts/openapi.yaml` | `0e30864324558ab6a292f354553e8ead64494cf468009b0e11b4fbcfb8dbd181` |
| `contracts/fixtures.json` | `ceb7de532267159738ba47041693ab60c3256fd39dcdcfc0d17d69c66befb14a` |
| `contracts/state-table.md` | `6beaaa30b37effe452bc8c9f67a1813ca3c3d739b59cf859c50623eaeba517e6` |
| `contracts/error-codes.md` | `34f859bc5644eaef5411ffc13ae6c4788b8b103eb564d169ecb8efd16712b846` |

All sidecars pass `shasum -a 256 -c`; JSON and YAML parse; both lifecycle and independent frontend
changes pass strict OpenSpec validation. No unresolved product decision remains in task 1.4.
