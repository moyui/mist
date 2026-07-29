## 1. Backend Channel Contract

- [x] 1.1 Classify Phase A channels with range/extreme rules and constrain Phase B reduction by time overlap, zone compatibility, and Invalid membership.
- [x] 1.2 Add synthetic RED/GREEN coverage for classification, reduction, separated ranges, and residual Invalid filtering.
- [x] 1.3 Document the canonical two-phase response with a dedicated Swagger model and metadata contract test.
- [x] 1.4 Keep the offline channel phase export tool and remove all backend test dependencies on frontend fixtures.

## 2. Frontend Compatibility And Fixtures

- [x] 2.1 Normalize legacy arrays and canonical channel phase objects at live API and snapshot boundaries, rendering Phase B by default.
- [x] 2.2 Update phase-specific statistics and regenerate the four frontend channel snapshots from committed merged-K data.
- [x] 2.3 Add current API/snapshot documentation without rewriting archived historical design records.

## 3. Verification And Evidence

- [x] 3.1 Run backend lint, typecheck, full tests, CI contracts, build, and strict OpenSpec validation.
- [x] 3.2 Run frontend lint, typecheck, full tests, and production build.
- [x] 3.3 Record final verification evidence and confirm both repositories are independently testable.
