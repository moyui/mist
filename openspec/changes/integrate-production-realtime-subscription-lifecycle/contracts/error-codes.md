# Realtime subscription HTTP result table

Expected domain rejections use HTTP 200 and the shared error envelope. Their `data` shapes are
fixed below.

| Code | Applies to | Safe message | Typed `data` |
| --- | --- | --- | --- |
| `REALTIME_SOURCE_LOCKED` | assigned source update/delete | `Realtime source is locked by an assignment` | `{ assignmentId, securityId, securitySourceConfigId }` |
| `REALTIME_ACTIVE_CAPACITY_REACHED` | active initialization/activation | `Realtime active capacity reached` | `{ source, activeAssignmentCount, limit }` |
| `REALTIME_ASSIGNMENT_EXISTS` | initialization for an assigned Security/config | `Realtime assignment already exists` | `{ assignmentId, securityId }` |
| `REALTIME_SECURITY_EXISTS` | new-mode canonical code already exists | `Security already exists` | `{ securityId, securityCode }` |
| `REALTIME_SOURCE_CONFIG_NOT_FOUND` | existing-mode source config ID cannot be resolved | `Source config was not found` | `{ securitySourceConfigId }` |
| `REALTIME_SECURITY_NOT_ELIGIBLE` | existing Security is not ACTIVE STOCK | `Security is not eligible for realtime assignment` | `{ securityId, reason }` |
| `REALTIME_SOURCE_CONFIG_NOT_ELIGIBLE` | source config disabled, wrong provider or wrong Security | `Source config is not eligible for realtime assignment` | `{ securitySourceConfigId, reason }` |

Eligibility `reason` is a bounded enum:
`security_not_active`, `security_not_stock`, `source_not_realtime`, `source_disabled`,
`provider_symbol_invalid`.

The following are not business rejections and retain their real HTTP status:

| HTTP | Condition | Envelope code |
| --- | --- | --- |
| 400 | DTO/enum/provider-symbol/cursor validation failure | `BAD_REQUEST` |
| 404 | existing legacy Security/source lookup path does not find its resource | `NOT_FOUND` |
| 500 | unknown TypeORM/programming failure | `INTERNAL_SERVER_ERROR` |

Initialization does not place provider I/O in the database transaction. If post-commit incremental
provider add/readback fails, the POST/PUT persistence result remains successful and inventory reports
the resulting convergence state; it is not rewritten as a dependency error.

Unknown constraint/database errors must not be converted to one of the expected codes. Public data
must not contain provider subId, owner/lease/generation, journal path/digest, stack or raw exception.
