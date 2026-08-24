# Frozen realtime subscription HTTP contract

Status: approved implementation input for `integrate-production-realtime-subscription-lifecycle`
task 1.4 and handoff input for `add-realtime-subscription-operator-ux`.

The files in this directory are normative together:

- `openapi.yaml`: exact paths, request fields, response fields, nullability and enums;
- `fixtures.json`: pinned success and business-rejection examples;
- `state-table.md`: desired, active evidence, convergence and deferred-removal semantics;
- `error-codes.md`: expected HTTP-200 business rejections and real transport failures.

Every file has a sibling `.sha256`. Backend generated OpenAPI and frontend fixture copies must match
these contracts. A field, enum, nullability or error-code change requires an owning OpenSpec update
and refreshed digests; consumers must not add compatibility aliases.

Contract rules:

- public realtime source is exactly `tdx|qmt`; `mqmt` is invalid;
- `desired` is computed from `securityStatus=ACTIVE` and is never writable here;
- `active=null` means no trustworthy current readback and must not be coerced to false;
- initialization uses `mode=new|existing` as an exact discriminated union;
- existing binding submits only `securitySourceConfigId` after the existing one-security sources
  lookup;
- assignment listing is `assignmentId ASC`, default limit 20, maximum 100;
- `sourceCapacities` is independent of the returned page and counts ACTIVE assignments, not provider
  evidence;
- Security activation/deactivation remains the existing PUT contract and returns `data=null`;
- timestamps are RFC 3339 UTC strings; cursor and identifier fields are positive integers.
