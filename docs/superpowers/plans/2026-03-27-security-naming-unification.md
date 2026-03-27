# Security Module Naming Unification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify naming conventions in the security module by replacing all `Stock` references with `Security` across service, controller, DTO, and test files.

**Architecture:** Bottom-up refactoring starting with DTOs (no dependencies), then Service, Module, Controller, and finally Tests. Each layer is updated independently with its own commit for easy rollback.

**Tech Stack:** NestJS, TypeORM, TypeScript, Jest, Swagger/OpenAPI

---

## File Structure

```
mist/apps/mist/src/security/
├── dto/
│   ├── init-stock.dto.ts           → init-security.dto.ts (rename)
│   └── add-source.dto.ts           → add-security-source.dto.ts (rename)
├── security.service.ts             (modify)
├── security.controller.ts          (modify)
├── security.module.ts              (modify)
├── security.service.spec.ts        (modify)
└── security.controller.spec.ts     (modify)
```

---

## Task 1: Rename init-stock.dto.ts → init-security.dto.ts

**Files:**
- Create: `apps/mist/src/security/dto/init-security.dto.ts`
- Delete: `apps/mist/src/security/dto/init-stock.dto.ts`

- [ ] **Step 1: Create new DTO file with renamed class**

Create `apps/mist/src/security/dto/init-security.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum } from 'class-validator';
import { SecurityType } from '@app/shared-data';

export class InitSecurityDto {
  @ApiProperty({ description: 'Security code (e.g., 000001.SH, 399006.SZ)' })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiProperty({ description: 'Security name', required: false })
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Security type', enum: SecurityType })
  @IsEnum(SecurityType)
  type!: SecurityType;
}
```

- [ ] **Step 2: Delete old DTO file**

```bash
rm apps/mist/src/security/dto/init-stock.dto.ts
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd /Users/xiyugao/code/mist/mist && pnpm run build
```
Expected: May show errors in files that import the old DTO name (expected at this stage)

- [ ] **Step 4: Commit**

```bash
git add apps/mist/src/security/dto/init-security.dto.ts
git rm apps/mist/src/security/dto/init-stock.dto.ts
git commit -m "$(cat <<'EOF'
refactor: rename InitStockDto to InitSecurityDto

- Rename init-stock.dto.ts to init-security.dto.ts
- Update class name from InitStockDto to InitSecurityDto
- Update ApiProperty descriptions: Stock → Security

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Rename add-source.dto.ts → add-security-source.dto.ts

**Files:**
- Create: `apps/mist/src/security/dto/add-security-source.dto.ts`
- Delete: `apps/mist/src/security/dto/add-source.dto.ts`

- [ ] **Step 1: Create new DTO file with renamed class**

Create `apps/mist/src/security/dto/add-security-source.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { DataSource } from '@app/shared-data';

export class AddSecuritySourceDto {
  @ApiProperty({ description: 'Security code (e.g., 000001.SH, 399006.SZ)' })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiProperty({ description: 'Data source', enum: DataSource })
  @IsEnum(DataSource)
  source!: DataSource;

  @ApiProperty({
    description: 'Data source specific code format',
    required: false,
  })
  @IsOptional()
  @IsString()
  formatCode?: string;

  @ApiProperty({
    description: 'Priority (higher = preferred)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiProperty({ description: 'Whether source is enabled', required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
```

- [ ] **Step 2: Delete old DTO file**

```bash
rm apps/mist/src/security/dto/add-source.dto.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/security/dto/add-security-source.dto.ts
git rm apps/mist/src/security/dto/add-source.dto.ts
git commit -m "$(cat <<'EOF'
refactor: rename AddSourceDto to AddSecuritySourceDto

- Rename add-source.dto.ts to add-security-source.dto.ts
- Update class name from AddSourceDto to AddSecuritySourceDto
- Update ApiProperty descriptions: Stock → Security

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Update SecurityService methods and internals

**Files:**
- Modify: `apps/mist/src/security/security.service.ts:1-169`

- [ ] **Step 1: Update DTO imports**

Replace lines 13-14 in `security.service.ts`:

```typescript
// Old:
import { InitStockDto } from './dto/init-stock.dto';
import { AddSourceDto } from './dto/add-source.dto';

// New:
import { InitSecurityDto } from './dto/init-security.dto';
import { AddSecuritySourceDto } from './dto/add-security-source.dto';
```

- [ ] **Step 2: Rename method initStock → initializeSecurity**

Replace method at lines 29-51:

```typescript
async initializeSecurity(initSecurityDto: InitSecurityDto): Promise<Security> {
  const formattedCode = this.formatCode(initSecurityDto.code);

  const existingSecurity = await this.securityRepository.findOne({
    where: { code: formattedCode },
  });

  if (existingSecurity) {
    throw new ConflictException(
      `Security with code ${formattedCode} already exists`,
    );
  }

  // Create security
  const security = this.securityRepository.create({
    code: formattedCode,
    name: initSecurityDto.name || '',
    type: initSecurityDto.type,
    status: SecurityStatus.ACTIVE,
  });

  return await this.securityRepository.save(security);
}
```

- [ ] **Step 3: Rename method addSource → addSecuritySource**

Replace method at lines 53-74:

```typescript
async addSecuritySource(addSecuritySourceDto: AddSecuritySourceDto): Promise<Security> {
  const formattedCode = this.formatCode(addSecuritySourceDto.code);

  const security = await this.securityRepository.findOne({
    where: { code: formattedCode },
  });

  if (!security) {
    throw new NotFoundException(`Security with code ${formattedCode} not found`);
  }

  const sourceConfig = this.sourceConfigRepository.create({
    security: security,
    source: addSecuritySourceDto.source,
    formatCode: addSecuritySourceDto.formatCode || '',
    priority: addSecuritySourceDto.priority ?? 0,
    enabled: addSecuritySourceDto.enabled ?? true,
  });
  await this.sourceConfigRepository.save(sourceConfig);

  return security;
}
```

- [ ] **Step 4: Rename method findByCode → findSecurityByCode**

Replace method at lines 76-88:

```typescript
async findSecurityByCode(code: string): Promise<Security> {
  const formattedCode = this.formatCode(code);

  const security = await this.securityRepository.findOne({
    where: { code: formattedCode },
  });

  if (!security) {
    throw new NotFoundException(`Security with code ${formattedCode} not found`);
  }

  return security;
}
```

- [ ] **Step 5: Update getSourceFormat method**

Replace method at lines 90-118:

```typescript
async getSecuritySources(code: string): Promise<
  Array<{
    id: number;
    securityId: number;
    source: string;
    formatCode: string;
    priority: number;
    enabled: boolean;
  }>
> {
  const security = await this.findSecurityByCode(code);

  // Get all source configs for this security, ordered by priority (highest first)
  const sourceConfigs = await this.sourceConfigRepository.find({
    where: { security: { id: security.id } },
    relations: ['security'],
    order: { priority: 'DESC' },
  });

  // Return all source configs with all fields
  return sourceConfigs.map((config) => ({
    id: config.id,
    securityId: config.securityId,
    source: config.source,
    formatCode: config.formatCode,
    priority: config.priority,
    enabled: config.enabled,
  }));
}
```

- [ ] **Step 6: Update comment for getActiveSecurities method**

Replace comment at lines 126-133:

```typescript
/**
 * Get all active securities for scheduled collection.
 *
 * Returns array of security codes that have ACTIVE status.
 * Used by the scheduler to determine which securities to collect data for.
 *
 * @returns Array of active security codes
 */
```

- [ ] **Step 7: Rename method deactivateStock → deactivateSecurity**

Replace method at lines 144-155:

```typescript
async deactivateSecurity(code: string): Promise<void> {
  const formattedCode = this.formatCode(code);

  const result = await this.securityRepository.update(
    { code: formattedCode },
    { status: SecurityStatus.SUSPENDED },
  );

  if (result.affected === 0) {
    throw new NotFoundException(`Security with code ${formattedCode} not found`);
  }
}
```

- [ ] **Step 8: Rename method activateStock → activateSecurity**

Replace method at lines 157-168:

```typescript
async activateSecurity(code: string): Promise<void> {
  const formattedCode = this.formatCode(code);

  const result = await this.securityRepository.update(
    { code: formattedCode },
    { status: SecurityStatus.ACTIVE },
  );

  if (result.affected === 0) {
    throw new NotFoundException(`Security with code ${formattedCode} not found`);
  }
}
```

- [ ] **Step 9: Verify TypeScript compilation**

```bash
cd /Users/xiyugao/code/mist/mist && pnpm run build
```
Expected: May show errors in controller and test files (expected at this stage)

- [ ] **Step 10: Commit**

```bash
git add apps/mist/src/security/security.service.ts
git commit -m "$(cat <<'EOF'
refactor: rename SecurityService methods from Stock to Security

- initStock → initializeSecurity
- addSource → addSecuritySource
- findByCode → findSecurityByCode
- getSourceFormat → getSecuritySources
- deactivateStock → deactivateSecurity
- activateStock → activateSecurity
- Update internal variables: existingStock → existingSecurity, stock → security
- Update error messages: "Stock with code" → "Security with code"
- Update DTO imports to use new class names

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update SecurityModule imports

**Files:**
- Modify: `apps/mist/src/security/security.module.ts`

**Note**: NestJS auto-discovers DTOs, so this module typically has no explicit DTO imports. This task verifies that assumption.

- [ ] **Step 1: Verify security.module.ts imports**

Check `apps/mist/src/security/security.module.ts` for any explicit DTO imports. The file should look like:

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([Security, SecuritySourceConfig])],
  controllers: [SecurityController],
  providers: [SecurityService],
  exports: [],
})
export class SecurityModule {}
```

If there are no explicit DTO imports (expected), no changes are needed. If there are, update them to use the new DTO filenames.

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/xiyugao/code/mist/mist && pnpm run build
```

- [ ] **Step 3: Commit (if changes made)**

```bash
git add apps/mist/src/security/security.module.ts
git commit -m "$(cat <<'EOF'
refactor: update SecurityModule DTO imports

Update imports to use renamed DTO files.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update SecurityController methods and API documentation

**Files:**
- Modify: `apps/mist/src/security/security.controller.ts:1-108`

- [ ] **Step 1: Update DTO imports**

Replace lines 18-19 in `security.controller.ts`:

```typescript
// Old:
import { InitStockDto } from './dto/init-stock.dto';
import { AddSourceDto } from './dto/add-source.dto';

// New:
import { InitSecurityDto } from './dto/init-security.dto';
import { AddSecuritySourceDto } from './dto/add-security-source.dto';
```

- [ ] **Step 2: Rename initStock method and update endpoint**

Replace lines 28-39:

```typescript
@Post('initialize')
@HttpCode(HttpStatus.CREATED)
@ApiOperation({ summary: 'Initialize a new security' })
@ApiResponse({
  status: 201,
  description: 'Security successfully initialized',
  type: Security,
})
@ApiResponse({ status: 409, description: 'Security already exists' })
async initializeSecurity(@Body() initSecurityDto: InitSecurityDto): Promise<Security> {
  return await this.securityService.initializeSecurity(initSecurityDto);
}
```

- [ ] **Step 3: Rename addSource method and update endpoint**

Replace lines 41-51:

```typescript
@Post('sources')
@ApiOperation({ summary: 'Add or update data source for an existing security' })
@ApiResponse({
  status: 200,
  description: 'Source successfully updated',
  type: Security,
})
@ApiResponse({ status: 404, description: 'Security not found' })
async addSecuritySource(@Body() addSecuritySourceDto: AddSecuritySourceDto): Promise<Security> {
  return await this.securityService.addSecuritySource(addSecuritySourceDto);
}
```

- [ ] **Step 4: Rename getStock method**

Replace lines 53-63:

```typescript
@Get(':code')
@ApiOperation({ summary: 'Get security by code' })
@ApiParam({
  name: 'code',
  description: 'Security code (e.g., 000001.SH, 399006.SZ)',
})
@ApiResponse({ status: 200, description: 'Security found', type: Security })
@ApiResponse({ status: 404, description: 'Security not found' })
async findSecurityByCode(@Param('code') code: string): Promise<Security> {
  return await this.securityService.findSecurityByCode(code);
}
```

- [ ] **Step 5: Rename getAllStocks method**

Replace lines 65-74:

```typescript
@Get('all')
@ApiOperation({ summary: 'Get all active securities' })
@ApiResponse({
  status: 200,
  description: 'List of all active securities',
  type: [Security],
})
async getAllSecurities(): Promise<Security[]> {
  return await this.securityService.findAll();
}
```

- [ ] **Step 6: Rename deactivateStock method and update docs**

Replace lines 76-84:

```typescript
@Put(':code/deactivate')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Deactivate a security' })
@ApiParam({ name: 'code', description: 'Security code to deactivate' })
@ApiResponse({ status: 200, description: 'Security successfully deactivated' })
@ApiResponse({ status: 404, description: 'Security not found' })
async deactivateSecurity(@Param('code') code: string): Promise<void> {
  await this.securityService.deactivateSecurity(code);
}
```

- [ ] **Step 7: Rename activateStock method and update docs**

Replace lines 86-94:

```typescript
@Put(':code/activate')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Activate a deactivated security' })
@ApiParam({ name: 'code', description: 'Security code to activate' })
@ApiResponse({ status: 200, description: 'Security successfully activated' })
@ApiResponse({ status: 404, description: 'Security not found' })
async activateSecurity(@Param('code') code: string): Promise<void> {
  await this.securityService.activateSecurity(code);
}
```

- [ ] **Step 8: Rename getSource method and update docs**

Replace lines 96-106:

```typescript
@Get(':code/sources')
@ApiOperation({ summary: 'Get source configuration for a security' })
@ApiParam({ name: 'code', description: 'Security code' })
@ApiResponse({
  status: 200,
  description: 'Source configuration retrieved successfully',
})
@ApiResponse({ status: 404, description: 'Security not found' })
async getSecuritySources(@Param('code') code: string) {
  return await this.securityService.getSecuritySources(code);
}
```

- [ ] **Step 9: Verify TypeScript compilation**

```bash
cd /Users/xiyugao/code/mist/mist && pnpm run build
```
Expected: Should compile successfully, may show test errors (expected)

- [ ] **Step 10: Commit**

```bash
git add apps/mist/src/security/security.controller.ts
git commit -m "$(cat <<'EOF'
refactor: rename SecurityController methods from Stock to Security

- initStock → initializeSecurity, endpoint: POST /init → /initialize
- addSource → addSecuritySource, endpoint: POST /add-source → /sources
- getStock → findSecurityByCode
- getAllStocks → getAllSecurities
- deactivateStock → deactivateSecurity
- activateStock → activateSecurity
- getSource → getSecuritySources, endpoint: GET /:code/source → /:code/sources
- Update all Swagger documentation: Stock → Security

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update SecurityService tests

**Files:**
- Modify: `apps/mist/src/security/security.service.spec.ts`

- [ ] **Step 1: Update DTO imports**

Replace lines 10-11 in `security.service.spec.ts`:

```typescript
// Old:
import { InitStockDto } from './dto/init-stock.dto';
import { AddSourceDto } from './dto/add-source.dto';

// New:
import { InitSecurityDto } from './dto/init-security.dto';
import { AddSecuritySourceDto } from './dto/add-security-source.dto';
```

- [ ] **Step 2: Update initStock test cases**

Find and replace all occurrences in the file:
- `describe('initStock'` → `describe('initializeSecurity'`
- `initStockDto: InitStockDto` → `initSecurityDto: InitSecurityDto`
- `service.initStock` → `service.initializeSecurity`

- [ ] **Step 3: Update addSource test cases**

Find and replace all occurrences:
- `describe('addSource'` → `describe('addSecuritySource'`
- `addSourceDto: AddSourceDto` → `addSecuritySourceDto: AddSecuritySourceDto`
- `service.addSource` → `service.addSecuritySource`

- [ ] **Step 4: Update deactivateStock test cases**

Find and replace all occurrences:
- `describe('deactivateStock'` → `describe('deactivateSecurity'`
- `service.deactivateStock` → `service.deactivateSecurity`

- [ ] **Step 5: Update activateStock test cases**

Find and replace all occurrences:
- `describe('activateStock'` → `describe('activateSecurity'`
- `service.activateStock` → `service.activateSecurity`

- [ ] **Step 6: Update mock variables**

Replace `mockStock` with `mockSecurity` throughout the file.

- [ ] **Step 7: Run tests**

```bash
cd /Users/xiyugao/code/mist/mist && pnpm run test security.service.spec.ts
```
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add apps/mist/src/security/security.service.spec.ts
git commit -m "$(cat <<'EOF'
test: update SecurityService tests for renamed methods

- Update DTO imports: InitStockDto → InitSecurityDto, AddSourceDto → AddSecuritySourceDto
- Rename test describe blocks: initStock → initializeSecurity, etc.
- Update method calls to use new names
- Rename mock variables: mockStock → mockSecurity

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update SecurityController tests

**Files:**
- Modify: `apps/mist/src/security/security.controller.spec.ts`

- [ ] **Step 1: Update DTO imports**

Replace lines 4-5 in `security.controller.spec.ts`:

```typescript
// Old:
import { InitStockDto } from './dto/init-stock.dto';
import { AddSourceDto } from './dto/add-source.dto';

// New:
import { InitSecurityDto } from './dto/init-security.dto';
import { AddSecuritySourceDto } from './dto/add-security-source.dto';
```

- [ ] **Step 2: Update mock service methods**

Replace lines 14-15 in the mock object:

```typescript
// Old:
deactivateStock: jest.fn(),
activateStock: jest.fn(),

// New:
deactivateSecurity: jest.fn(),
activateSecurity: jest.fn(),
```

- [ ] **Step 3: Update all test cases**

Find and replace all occurrences throughout the file:
- `initStockDto: InitStockDto` → `initSecurityDto: InitSecurityDto`
- `addSourceDto: AddSourceDto` → `addSecuritySourceDto: AddSecuritySourceDto`
- `mockSecurityService.initStock` → `mockSecurityService.initializeSecurity`
- `mockSecurityService.addSource` → `mockSecurityService.addSecuritySource`
- `mockSecurityService.deactivateStock` → `mockSecurityService.deactivateSecurity`
- `mockSecurityService.activateStock` → `mockSecurityService.activateSecurity`
- `controller.initStock` → `controller.initializeSecurity`
- `controller.addSource` → `controller.addSecuritySource`
- `controller.deactivateStock` → `controller.deactivateSecurity`
- `controller.activateStock` → `controller.activateSecurity`

- [ ] **Step 4: Update describe blocks**

Find and replace:
- `describe('initStock'` → `describe('initializeSecurity'`
- `describe('addSource'` → `describe('addSecuritySource'`
- `describe('deactivateStock'` → `describe('deactivateSecurity'`
- `describe('activateStock'` → `describe('activateSecurity'`

- [ ] **Step 5: Update mock variables**

Replace `mockStock` with `mockSecurity` throughout the file.

- [ ] **Step 6: Run tests**

```bash
cd /Users/xiyugao/code/mist/mist && pnpm run test security.controller.spec.ts
```
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/mist/src/security/security.controller.spec.ts
git commit -m "$(cat <<'EOF'
test: update SecurityController tests for renamed methods

- Update DTO imports: InitStockDto → InitSecurityDto, AddSourceDto → AddSecuritySourceDto
- Update mock service method names
- Rename test describe blocks and method calls
- Rename mock variables: mockStock → mockSecurity

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Final verification and cleanup

**Files:** All modified files

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/xiyugao/code/mist/mist && pnpm run test
```
Expected: All tests pass

- [ ] **Step 2: Run linting**

```bash
pnpm run lint
```
Expected: No linting errors

- [ ] **Step 3: Build project**

```bash
pnpm run build
```
Expected: Build succeeds with no errors

- [ ] **Step 4: Start development server and verify Swagger UI**

```bash
pnpm run start:dev:mist
```

Then visit http://localhost:8001/api-docs and verify:
- Endpoint paths show new names (`/initialize`, `/sources`, `/:code/sources`)
- Descriptions show "Security" instead of "Stock"
- DTO names show `InitSecurityDto` and `AddSecuritySourceDto`

- [ ] **Step 5: Manual endpoint testing**

Test each endpoint with curl or Postman:

```bash
# Test initialize endpoint
curl -X POST http://localhost:8001/security/v1/initialize \
  -H "Content-Type: application/json" \
  -d '{"code": "TEST001.SH", "name": "Test Security", "type": "stock"}'

# Test get all securities
curl http://localhost:8001/security/v1/all

# Test deactivate
curl -X PUT http://localhost:8001/security/v1/TEST001.SH/deactivate

# Test activate
curl -X PUT http://localhost:8001/security/v1/TEST001.SH/activate

# Test get sources
curl http://localhost:8001/security/v1/TEST001.SH/sources
```

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "$(cat <<'EOF'
chore: final verification for security naming unification

All tests passing, linting clean, build successful.
Swagger UI verified with updated API documentation.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Verification Checklist

After completing all tasks:

- [ ] All DTO files renamed and classes updated
- [ ] All Service methods renamed
- [ ] All Controller methods and endpoints updated
- [ ] All Swagger documentation updated
- [ ] All imports updated across all files
- [ ] All tests passing
- [ ] Linting clean
- [ ] Build successful
- [ ] Swagger UI displays correct API documentation
- [ ] Manual endpoint testing successful

---

## Notes

- This is a pure naming refactoring - no logic changes
- Each task commits independently for easy rollback
- TypeScript compilation will catch any missed references
- Response structure remains unchanged - only names and paths change
- Breaking change for external API consumers - notify accordingly
