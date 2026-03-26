# initStock Decoupling Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple initStock() from K-line data collection and source configuration, making it responsible only for creating Security entities.

**Architecture:** Simplify SecurityService by removing CollectorService dependency and source config creation from initStock(). Implement addSource() method to handle source configuration separately. Follow Single Responsibility Principle.

**Tech Stack:** NestJS, TypeORM, Jest

---

## File Structure

**Files to modify:**
- `mist/apps/mist/src/security/dto/init-stock.dto.ts` - Remove periods and source fields
- `mist/apps/mist/src/security/security.service.ts` - Simplify initStock(), implement addSource(), remove unused methods
- `mist/apps/mist/src/security/security.module.ts` - Remove CollectorService dependency
- `mist/apps/mist/src/security/security.service.spec.ts` - Update unit tests
- `mist/apps/mist/src/security/security.controller.spec.ts` - Update e2e tests

---

## Task 1: Update InitStockDto

**Files:**
- Modify: `mist/apps/mist/src/security/dto/init-stock.dto.ts`

- [ ] **Step 1: Simplify InitStockDto class**

Remove `periods` and `source` fields, keeping only `code`, `name`, and `type`:

```typescript
export class InitStockDto {
  @ApiProperty({ description: 'Stock code (e.g., 000001.SH, 399006.SZ)' })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiProperty({ description: 'Stock name', required: false })
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Security type', enum: SecurityType })
  @IsEnum(SecurityType)
  type!: SecurityType;
}
```

- [ ] **Step 2: Verify no compilation errors**

Run: `cd mist && pnpm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add mist/apps/mist/src/security/dto/init-stock.dto.ts
git commit -m "refactor: simplify InitStockDto

Remove periods and source fields to decouple stock creation from
data collection and source configuration.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Simplify initStock() Method

**Files:**
- Modify: `mist/apps/mist/src/security/security.service.ts:33-81`

- [ ] **Step 1: Write failing test for simplified initStock()**

Add test to `mist/apps/mist/src/security/security.service.spec.ts`:

```typescript
describe('initStock', () => {
  it('should create a stock without source config or data collection', async () => {
    const initStockDto: InitStockDto = {
      code: '600000',
      name: '浦发银行',
      type: SecurityType.STOCK,
    };

    jest.spyOn(securityRepository, 'findOne').mockResolvedValue(null);
    jest.spyOn(securityRepository, 'create').mockReturnValue({
      id: 1,
      code: '600000',
      name: '浦发银行',
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
    } as Security);
    jest.spyOn(securityRepository, 'save').mockResolvedValue({
      id: 1,
      code: '600000',
      name: '浦发银行',
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
    } as Security);

    const result = await service.initStock(initStockDto);

    expect(result).toBeDefined();
    expect(result.code).toBe('600000');
    expect(result.type).toBe(SecurityType.STOCK);
  });

  it('should throw ConflictException if stock already exists', async () => {
    const initStockDto: InitStockDto = {
      code: '600000',
      type: SecurityType.STOCK,
    };

    jest.spyOn(securityRepository, 'findOne').mockResolvedValue({
      id: 1,
      code: '600000',
    } as Security);

    await expect(service.initStock(initStockDto)).rejects.toThrow(
      ConflictException,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mist && pnpm run test security.service.spec`
Expected: FAIL (test expects simplified behavior but current implementation has coupled logic)

- [ ] **Step 3: Implement simplified initStock()**

Replace the `initStock()` method in `mist/apps/mist/src/security/security.service.ts`:

```typescript
async initStock(initStockDto: InitStockDto): Promise<Security> {
  const formattedCode = this.formatCode(initStockDto.code);

  const existingStock = await this.securityRepository.findOne({
    where: { code: formattedCode },
  });

  if (existingStock) {
    throw new ConflictException(
      `Stock with code ${formattedCode} already exists`,
    );
  }

  const stock = this.securityRepository.create({
    code: formattedCode,
    name: initStockDto.name || '',
    type: initStockDto.type,
    status: SecurityStatus.ACTIVE,
  });

  return await this.securityRepository.save(stock);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mist && pnpm run test security.service.spec`
Expected: PASS

- [ ] **Step 5: Remove unused helper method**

Remove `mapMinutesToPeriod()` method (lines 100-110) from `security.service.ts`:

```typescript
// DELETE this entire method:
private mapMinutesToPeriod(minutes: number): Period {
  const mapping: Record<number, Period> = {
    1: Period.ONE_MIN,
    5: Period.FIVE_MIN,
    15: Period.FIFTEEN_MIN,
    30: Period.THIRTY_MIN,
    60: Period.SIXTY_MIN,
    1440: Period.DAY,
  };
  return mapping[minutes] || Period.FIVE_MIN;
}
```

- [ ] **Step 6: Remove CollectorService import**

Remove from imports in `security.service.ts`:

```typescript
import { CollectorService } from '../collector/collector.service';  // DELETE THIS LINE
```

- [ ] **Step 7: Remove CollectorService from constructor**

Update constructor in `security.service.ts`:

```typescript
constructor(
  @InjectRepository(Security)
  private readonly securityRepository: Repository<Security>,
  @InjectRepository(SecuritySourceConfig)
  private readonly sourceConfigRepository: Repository<SecuritySourceConfig>,
) {}
```

- [ ] **Step 8: Commit**

```bash
git add mist/apps/mist/src/security/security.service.ts
git add mist/apps/mist/src/security/security.service.spec.ts
git commit -m "refactor: simplify initStock method

- Remove K-line data collection logic
- Remove source config creation logic
- Remove CollectorService dependency
- Remove unused mapMinutesToPeriod method
- Add unit tests for simplified behavior

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Implement addSource() Method

**Files:**
- Modify: `mist/apps/mist/src/security/security.service.ts:120-136`

- [ ] **Step 1: Write failing test for addSource()**

Add test to `mist/apps/mist/src/security/security.service.spec.ts`:

```typescript
describe('addSource', () => {
  it('should create source config for existing stock', async () => {
    const addSourceDto: AddSourceDto = {
      code: '600000',
      source: {
        type: SourceType.AKTOOLS,
        config: '{}',
      },
    };

    const mockStock = {
      id: 1,
      code: '600000',
      name: '浦发银行',
      type: SecurityType.STOCK,
      status: SecurityStatus.ACTIVE,
    } as Security;

    jest.spyOn(securityRepository, 'findOne').mockResolvedValue(mockStock);
    jest.spyOn(sourceConfigRepository, 'create').mockReturnValue({
      security: mockStock,
      source: DataSource.EAST_MONEY,
      formatCode: '{}',
    } as SecuritySourceConfig);
    jest.spyOn(sourceConfigRepository, 'save').mockResolvedValue({} as SecuritySourceConfig);

    const result = await service.addSource(addSourceDto);

    expect(result).toEqual(mockStock);
    expect(sourceConfigRepository.create).toHaveBeenCalledWith({
      security: mockStock,
      source: DataSource.EAST_MONEY,
      formatCode: '{}',
    });
  });

  it('should throw NotFoundException if stock not found', async () => {
    const addSourceDto: AddSourceDto = {
      code: '999999',
      source: {
        type: SourceType.AKTOOLS,
      },
    };

    jest.spyOn(securityRepository, 'findOne').mockResolvedValue(null);

    await expect(service.addSource(addSourceDto)).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mist && pnpm run test security.service.spec`
Expected: FAIL (current implementation doesn't create source config)

- [ ] **Step 3: Implement addSource() method**

Replace the `addSource()` method in `mist/apps/mist/src/security/security.service.ts`:

```typescript
async addSource(addSourceDto: AddSourceDto): Promise<Security> {
  const formattedCode = this.formatCode(addSourceDto.code);

  const stock = await this.securityRepository.findOne({
    where: { code: formattedCode },
  });

  if (!stock) {
    throw new NotFoundException(`Stock with code ${formattedCode} not found`);
  }

  // Create source config
  const dataSource = this.mapSourceStringToDataSource(addSourceDto.source.type);
  const sourceConfig = this.sourceConfigRepository.create({
    security: stock,
    source: dataSource,
    formatCode: addSourceDto.source.config || '{}',
  });
  await this.sourceConfigRepository.save(sourceConfig);

  return stock;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mist && pnpm run test security.service.spec`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mist/apps/mist/src/security/security.service.ts
git add mist/apps/mist/src/security/security.service.spec.ts
git commit -m "feat: implement addSource method

Add source configuration creation logic to addSource method.
Tests verify source config is created for existing stocks.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Update Security Module Dependencies

**Files:**
- Modify: `mist/apps/mist/src/security/security.module.ts`

- [ ] **Step 1: Remove CollectorService import and provider**

Read the current `security.module.ts` to see its structure:

```bash
cat mist/apps/mist/src/security/security.module.ts
```

If CollectorService is imported or provided, remove it. The module should only provide:
- SecurityService
- TypeORM repositories for Security and SecuritySourceConfig

- [ ] **Step 2: Verify module compiles**

Run: `cd mist && pnpm run build`
Expected: Build succeeds without CollectorService dependency

- [ ] **Step 3: Commit**

```bash
git add mist/apps/mist/src/security/security.module.ts
git commit -m "refactor: remove CollectorService from SecurityModule

SecurityService no longer depends on CollectorService after
initStock decoupling. Remove unused dependency.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Update E2E Tests

**Files:**
- Modify: `mist/apps/mist/src/security/security.controller.spec.ts`

- [ ] **Step 1: Update initStock e2e test**

Modify the test to use the simplified DTO:

```typescript
it('should initialize a stock', async () => {
  const initStockDto: InitStockDto = {
    code: '600000',
    name: '浦发银行',
    type: SecurityType.STOCK,
  };

  const response = await request(httpServer)
    .post('/security/v1/init')
    .send(initStockDto)
    .expect(201);

  expect(response.body).toHaveProperty('code', '600000');
  expect(response.body).toHaveProperty('type', SecurityType.STOCK);
});
```

- [ ] **Step 2: Add test for separate source configuration**

```typescript
it('should add source configuration to existing stock', async () => {
  // First create stock
  const initStockDto: InitStockDto = {
    code: '600001',
    name: '测试股票',
    type: SecurityType.STOCK,
  };

  await request(httpServer)
    .post('/security/v1/init')
    .send(initStockDto)
    .expect(201);

  // Then add source
  const addSourceDto: AddSourceDto = {
    code: '600001',
    source: {
      type: SourceType.AKTOOLS,
      config: '{}',
    },
  };

  const response = await request(httpServer)
    .post('/security/v1/add-source')
    .send(addSourceDto)
    .expect(200);

  expect(response.body).toHaveProperty('code', '600001');
});
```

- [ ] **Step 3: Run e2e tests**

Run: `cd mist && pnpm run test:e2e security.controller.spec`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add mist/apps/mist/src/security/security.controller.spec.ts
git commit -m "test: update e2e tests for decoupled initStock

- Simplify initStock test to use new DTO structure
- Add test for separate source configuration flow
- Verify two-step initialization process

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Verify Full Test Suite

**Files:**
- All modified files

- [ ] **Step 1: Run all security service tests**

Run: `cd mist && pnpm run test security.service.spec`
Expected: All tests pass

- [ ] **Step 2: Run all security controller tests**

Run: `cd mist && pnpm run test:e2e security.controller.spec`
Expected: All tests pass

- [ ] **Step 3: Run full test suite**

Run: `cd mist && pnpm run test`
Expected: All tests pass

- [ ] **Step 4: Verify build succeeds**

Run: `cd mist && pnpm run build`
Expected: Build succeeds without errors

- [ ] **Step 5: Final verification commit**

```bash
git add .
git commit -m "test: verify all tests pass after initStock decoupling

All unit and e2e tests pass with the new simplified architecture.
Build succeeds without errors.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Documentation Update (Optional)

**Files:**
- Modify: `mist/CLAUDE.md` (if API documentation needs updating)

- [ ] **Step 1: Update API documentation**

If the CLAUDE.md file documents the `/v1/security/init` endpoint, update the example to reflect the new simplified payload.

- [ ] **Step 2: Commit**

```bash
git add mist/CLAUDE.md
git commit -m "docs: update API documentation for simplified initStock

Reflect the removal of periods and source fields from InitStockDto.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Testing Strategy

**Unit Tests:**
- Test `initStock()` creates Security entity without side effects
- Test `initStock()` throws ConflictException for duplicate codes
- Test `addSource()` creates SecuritySourceConfig correctly
- Test `addSource()` throws NotFoundException for missing stocks

**E2E Tests:**
- Test HTTP endpoint `/v1/security/init` with simplified payload
- Test HTTP endpoint `/v1/security/add-source` creates source config
- Test two-step initialization flow

**Verification:**
- No calls to CollectorService in SecurityService
- Source config only created via `addSource()`
- All existing tests still pass

---

## Success Criteria

✅ `initStock()` only creates Security entity
✅ `addSource()` creates SecuritySourceConfig
✅ No K-line data collection in `initStock()`
✅ CollectorService not injected into SecurityService
✅ All tests pass
✅ Build succeeds
