# Security Module Naming Unification Design

**Date**: 2026-03-27
**Status**: Draft
**Author**: Claude Code

## Overview

Unify naming conventions in the security module by replacing all `Stock` references with `Security`. This refactoring improves code consistency and aligns terminology with the domain model (`Security` entity).

## Scope

**Affected Directory**: `mist/apps/mist/src/security/`

**Files**:
| File | Changes |
|------|---------|
| `security.service.ts` | Method renaming, variable renaming, comment updates |
| `security.controller.ts` | Method renaming, endpoint path updates, API documentation updates |
| `dto/init-stock.dto.ts` | Rename to `init-security.dto.ts`, class rename |
| `dto/add-source.dto.ts` | Rename to `add-security-source.dto.ts`, class rename |
| `security.service.spec.ts` | Test updates |
| `security.controller.spec.ts` | Test updates |
| `security.module.ts` | DTO import updates |

**No Impact**: Other apps (saya, schedule) and libs have no direct dependencies.

## Detailed Renaming Mapping

### Service Layer

| Old Method | New Method | Notes |
|------------|------------|-------|
| `initStock` | `initializeSecurity` | RESTful style |
| `addSource` | `addSecuritySource` | Add Security prefix |
| `findByCode` | `findSecurityByCode` | Add Security prefix |
| `getActiveSecurities` | `getActiveSecurities` | No change (already correct) |
| `findAll` | `findAll` | No change (service method already uses generic name) |
| `deactivateStock` | `deactivateSecurity` | Stock → Security |
| `activateStock` | `activateSecurity` | Stock → Security |
| `getSourceFormat` | `getSecuritySources` | More semantic |

**Internal Changes**:
- Variables: `existingStock` → `existingSecurity`, `stock` → `security`
- Error messages: `Stock with code ${formattedCode} not found` → `Security with code ${formattedCode} not found`
- Comments: `stock` → `security`

### Controller Layer

| Old Method | New Method | Old Endpoint | New Endpoint |
|------------|------------|--------------|--------------|
| `initStock` | `initializeSecurity` | `POST /init` | `POST /initialize` |
| `addSource` | `addSecuritySource` | `POST /add-source` | `POST /sources` |
| `getStock` | `findSecurityByCode` | `GET /:code` | `GET /:code` |
| `getAllStocks` | `getAllSecurities` | `GET /all` | `GET /all` |
| `deactivateStock` | `deactivateSecurity` | `PUT /:code/deactivate` | `PUT /:code/deactivate` |
| `activateStock` | `activateSecurity` | `PUT /:code/activate` | `PUT /:code/activate` |
| `getSource` | `getSecuritySources` | `GET /:code/source` | `GET /:code/sources` |

### DTO Layer

| Old File/Class | New File/Class |
|----------------|----------------|
| `init-stock.dto.ts` / `InitStockDto` | `init-security.dto.ts` / `InitSecurityDto` |
| `add-source.dto.ts` / `AddSourceDto` | `add-security-source.dto.ts` / `AddSecuritySourceDto` |

## API Endpoint Changes

**Before**:
```
POST   /security/v1/init
POST   /security/v1/add-source
GET    /security/v1/:code
GET    /security/v1/all
PUT    /security/v1/:code/deactivate
PUT    /security/v1/:code/activate
GET    /security/v1/:code/source
```

**After**:
```
POST   /security/v1/initialize
POST   /security/v1/sources
GET    /security/v1/:code
GET    /security/v1/all
PUT    /security/v1/:code/deactivate
PUT    /security/v1/:code/activate
GET    /security/v1/:code/sources
```

## Swagger Documentation Updates

### Complete Description Mapping

| Old Description | New Description |
|-----------------|-----------------|
| `Initialize a new stock` | `Initialize a new security` |
| `Add or update data source for an existing stock` | `Add or update data source for an existing security` |
| `Get stock by code` | `Get security by code` |
| `Get all active stocks` | `Get all active securities` |
| `Deactivate a stock` | `Deactivate a security` |
| `Activate a deactivated stock` | `Activate a deactivated security` |
| `Get source configuration for a stock` | `Get source configuration for a security` |
| `Stock code (e.g., 000001.SH, 399006.SZ)` | `Security code (e.g., 000001.SH, 399006.SZ)` |
| `Stock successfully initialized` | `Security successfully initialized` |
| `Stock already exists` | `Security already exists` |
| `Stock not found` | `Security not found` |
| `Stock successfully deactivated` | `Security successfully deactivated` |
| `Stock successfully activated` | `Security successfully activated` |

## Implementation Order

1. **DTO Layer** (bottom, no dependencies)
   - Rename `init-stock.dto.ts` → `init-security.dto.ts`
   - Rename `add-source.dto.ts` → `add-security-source.dto.ts`
   - Update class names and `@ApiProperty` descriptions

2. **Service Layer**
   - Rename methods
   - Update internal variables and comments
   - Update import statements

3. **Module Layer**
   - Update `security.module.ts` imports

4. **Controller Layer**
   - Rename methods
   - Update endpoint paths
   - Update API documentation annotations

5. **Test Layer**
   - Update `security.service.spec.ts`
   - Update `security.controller.spec.ts`

## Testing Strategy

### Test Variable Renaming

**Mock Objects**:
- `mockStock` → `mockSecurity`
- `mockStocks` → `mockSecurities`

**Test Descriptions**:
- `should create a stock without source config` → `should create a security without source config`
- `should throw ConflictException if stock already exists` → `should throw ConflictException if security already exists`
- `deactivateStock` → `deactivateSecurity`
- `activateStock` → `activateSecurity`

**Test Changes**:
1. Update import statements for DTOs and Service
2. Update mock object method names and variables
3. Update test cases (describe blocks, method calls)
4. Update test data (DTO type annotations)

**Verification**:
- All tests must pass after refactoring
- Test coverage should not decrease

## Acceptance Criteria

- [ ] All files renamed
- [ ] All Service methods renamed
- [ ] All Controller methods and endpoints updated
- [ ] All DTO classes and filenames updated
- [ ] All error messages and comments use `security`
- [ ] All import statements updated
- [ ] All tests passing
- [ ] Test coverage maintained
- [ ] Swagger documentation displays correct new API

## Response Structure

**Important**: The response structure and types remain unchanged.

- The `Security` entity is used throughout and doesn't change
- Response format (unified response wrapper with success, code, message, data) doesn't change
- Only method names and endpoint paths are updated

## Backward Compatibility

**Breaking Changes**:

| Change Type | Impact |
|-------------|--------|
| Endpoint paths | `/init` → `/initialize`, `/add-source` → `/sources` |
| DTO class names | `InitStockDto` → `InitSecurityDto` |
| Method names | `initStock` → `initializeSecurity` |

**Recommendation**: If external clients depend on this API, notify them to update. Consider providing a migration guide before release.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Missed test updates | Medium | Verify file-by-file, run full test suite |
| Import path errors | Low | TypeScript compilation will catch |
| API documentation inconsistencies | Low | Verify with Swagger UI |
| External client disruption | High | Notify all API consumers |

## Notes

- This is a pure naming refactoring with no logic changes
- Use the "one-shot refactoring" approach (Plan A) - all changes in a single effort
- TypeScript compilation will help catch any missed references

## Post-Refactoring Verification

After completing the refactoring, verify:

1. **Compilation**: Run `pnpm run build` to ensure no TypeScript errors
2. **Linting**: Run `pnpm run lint` to check code quality
3. **Tests**: Run `pnpm run test` to ensure all tests pass
4. **Swagger UI**: Visit http://localhost:8001/api-docs to verify API documentation displays correctly
5. **Manual Testing**: Test all endpoints with a tool like Postman or curl to ensure they work correctly
