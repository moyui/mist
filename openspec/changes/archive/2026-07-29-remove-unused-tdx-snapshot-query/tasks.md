## 1. Remove Runtime Surface

- [x] 1.1 Remove `TdxSource.fetchSnapshot`, its interface/type surface, and backend tests.
- [x] 1.2 Remove datasource `/v1/snapshots/query`, its exclusive provider/operation/model/normalization code, and route/unit tests.
- [x] 1.3 Remove the normalized snapshot probe from TDX deployment smoke and update script tests.

## 2. Align Contracts and References

- [x] 2.1 Update living OpenSpec requirements and backend-datasource documentation to describe only historical bars and realtime bridge paths.
- [x] 2.2 Regenerate TDX OpenAPI/reference artifacts and remove active coverage documentation for the endpoint.
- [x] 2.3 Add or update boundary tests proving `/v1/snapshots/query` and backend `fetchSnapshot` are absent.

## 3. Validate

- [x] 3.1 Run focused backend, datasource, and deployment tests plus lint/type checks for changed surfaces.
- [x] 3.2 Run strict OpenSpec validation and workspace searches proving the removed path remains only in archived evidence and this migration record.
