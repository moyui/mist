# MCP Server Agent-Friendly Error Recovery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance MCP Server error responses with recovery suggestions and next tool guidance for AI agents.

**Architecture:** Move error codes to shared library, create McpError class, enhance BaseMcpToolService to include recovery suggestions, and update all service business logic to use McpError.

**Tech Stack:** NestJS, TypeScript, @app/constants (shared library), Zod

---

## File Structure

Files to create:
- `libs/constants/src/mcp-errors.ts` - Error codes, McpError class, recovery mapping

Files to modify:
- `libs/constants/src/index.ts` - Export MCP errors
- `apps/mcp-server/src/base/base-mcp-tool.service.ts` - Enhanced error() method
- `apps/mcp-server/src/utils/validation.helpers.ts` - Remove McpErrorCode enum
- `apps/mcp-server/src/services/indicator-mcp.service.ts` - Use McpError (6 locations)
- `apps/mcp-server/src/services/data-mcp.service.ts` - Use McpError (8 locations)
- `apps/mcp-server/src/services/chan-mcp.service.ts` - Use McpError (3 locations)
- `apps/mcp-server/src/services/schedule-mcp.service.ts` - Use McpError (1 location)

---

## Phase 1: Infrastructure (1-2 hours)

### Task 1: Create MCP Error Definitions

**Files:**
- Create: `libs/constants/src/mcp-errors.ts`

- [ ] **Step 1: Create mcp-errors.ts with McpErrorCode enum**

```typescript
// libs/constants/src/mcp-errors.ts

/**
 * MCP Error codes
 * Centralized error codes for MCP Server tools
 */
export enum McpErrorCode {
  // Validation errors (100-199)
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  INVALID_PERIOD = 'INVALID_PERIOD',
  INVALID_SYMBOL = 'INVALID_SYMBOL',
  ARRAY_LENGTH_MISMATCH = 'ARRAY_LENGTH_MISMATCH',

  // Not found errors (200-299)
  INDEX_NOT_FOUND = 'INDEX_NOT_FOUND',
  DATA_NOT_FOUND = 'DATA_NOT_FOUND',

  // Data errors (300-399)
  DATA_PARSE_ERROR = 'DATA_PARSE_ERROR',
  INVALID_DATA_FORMAT = 'INVALID_DATA_FORMAT',

  // Calculation errors (400-499)
  CALCULATION_ERROR = 'CALCULATION_ERROR',
  INDICATOR_CALCULATION_FAILED = 'INDICATOR_CALCULATION_FAILED',
}
```

- [ ] **Step 2: Add McpError class**

```typescript
/**
 * Custom Error class for MCP tools that includes error codes
 */
export class McpError extends Error {
  constructor(
    message: string,
    public code: McpErrorCode,
  ) {
    super(message);
    this.name = 'McpError';
  }
}
```

- [ ] **Step 3: Add MCP_ERROR_RECOVERY mapping**

```typescript
/**
 * Recovery suggestions for MCP errors
 * Provides agents with actionable guidance when errors occur
 */
export const MCP_ERROR_RECOVERY: Record<string, {
  suggestions: string[];
  nextTool?: {
    name: string;
    reason: string;
    params?: Record<string, any>;
  };
}> = {
  [McpErrorCode.INSUFFICIENT_DATA]: {
    suggestions: [
      "Get more data using get_kline_data with larger limit",
      "Use a different indicator requiring fewer data points (e.g., RSI needs 14, MACD needs 26)"
    ],
    nextTool: {
      name: "get_kline_data",
      reason: "Fetch more historical data",
      params: { limit: 100 }
    }
  },

  [McpErrorCode.INVALID_SYMBOL]: {
    suggestions: [
      "Symbol cannot be empty or contain only whitespace",
      "Use list_indices to get valid symbol codes"
    ],
    nextTool: {
      name: "list_indices",
      reason: "Get valid index symbols"
    }
  },

  [McpErrorCode.INVALID_PERIOD]: {
    suggestions: [
      "Use a valid period value (minimum: 2 for RSI, 14 for most indicators, 26 for MACD)",
      "Check indicator documentation for minimum requirements"
    ]
  },

  [McpErrorCode.INVALID_DATE_RANGE]: {
    suggestions: [
      "Ensure start date is before end date",
      "Use ISO date format (YYYY-MM-DD or ISO 8601)"
    ]
  },

  [McpErrorCode.ARRAY_LENGTH_MISMATCH]: {
    suggestions: [
      "Ensure highs, lows, and closes arrays have the same length",
      "Verify data source provides complete OHLC data"
    ]
  },

  [McpErrorCode.INVALID_PARAMETER]: {
    suggestions: [
      "Check parameter format and type",
      "Refer to tool documentation for valid values"
    ]
  },

  [McpErrorCode.INDEX_NOT_FOUND]: {
    suggestions: [
      "Use list_indices to see available symbols",
      "Verify the symbol code is correct (e.g., '000001' for Shanghai Composite)"
    ],
    nextTool: {
      name: "list_indices",
      reason: "Discover available index symbols"
    }
  },

  [McpErrorCode.DATA_NOT_FOUND]: {
    suggestions: [
      "Check if data exists for the requested symbol and time range",
      "Use list_indices to verify the symbol is available"
    ]
  },

  [McpErrorCode.DATA_PARSE_ERROR]: {
    suggestions: [
      "Check data format and structure",
      "Ensure all required fields are present"
    ]
  },

  [McpErrorCode.INVALID_DATA_FORMAT]: {
    suggestions: [
      "Verify input data matches expected schema",
      "Check that arrays contain numbers, not strings"
    ]
  },

  [McpErrorCode.CALCULATION_ERROR]: {
    suggestions: [
      "Check input data quality and completeness",
      "Verify data doesn't contain null or NaN values"
    ]
  },

  [McpErrorCode.INDICATOR_CALCULATION_FAILED]: {
    suggestions: [
      "Try a different indicator",
      "Check data source for issues"
    ]
  }
};
```

- [ ] **Step 4: Verify TypeScript compilation**

```bash
pnpm run build -- libs/constants
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add libs/constants/src/mcp-errors.ts
git commit -m "feat(constants): add MCP error codes and recovery mapping

- Add McpErrorCode enum with 12 error codes
- Add McpError class with error code support
- Add MCP_ERROR_RECOVERY mapping with suggestions and next_tool
- Move from apps/mcp-server to shared library

Part of Phase 1: Infrastructure"
```

### Task 2: Update Shared Library Exports

**Files:**
- Modify: `libs/constants/src/index.ts`

- [ ] **Step 1: Export MCP errors**

```typescript
// Add to existing exports
export * from './mcp-errors';
```

- [ ] **Step 2: Verify exports**

```bash
node -e "const { McpErrorCode, McpError, MCP_ERROR_RECOVERY } = require('./libs/constants/src/index.ts'); console.log('✓ Exports work');"
```

Expected: `✓ Exports work`

- [ ] **Step 3: Commit**

```bash
git add libs/constants/src/index.ts
git commit -m "feat(constants): export MCP error types

- Export McpErrorCode, McpError, MCP_ERROR_RECOVERY
- Enable usage across all apps

Part of Phase 1: Infrastructure"
```

### Task 3: Remove Duplicate Error Codes

**Files:**
- Modify: `apps/mcp-server/src/utils/validation.helpers.ts`

- [ ] **Step 1: Add import comment at top of file**

```typescript
/**
 * Validation helper functions for MCP tools
 *
 * Note: McpErrorCode enum has been moved to @app/constants
 * Import from there instead:
 * import { McpErrorCode } from '@app/constants';
 */
```

- [ ] **Step 2: Delete McpErrorCode enum (lines 6-25)**

Delete the entire enum definition:
```typescript
export enum McpErrorCode { ... }
```

- [ ] **Step 3: Verify no local references**

```bash
grep -r "McpErrorCode" apps/mcp-server/src --exclude-dir=node_modules
```

Expected: Only import statements found, no local definitions

- [ ] **Step 4: Commit**

```bash
git add apps/mcp-server/src/utils/validation.helpers.ts
git commit -m "refactor(mcp): move McpErrorCode to shared library

- Remove duplicate enum definition
- Add import comment pointing to @app/constants
- Error codes now centralized in libs/constants

Part of Phase 1: Infrastructure"
```

---

## Phase 2: Enhance BaseMcpToolService (30 minutes)

### Task 4: Update Error Method

**Files:**
- Modify: `apps/mcp-server/src/base/base-mcp-tool.service.ts`

- [ ] **Step 1: Add import**

```typescript
import { MCP_ERROR_RECOVERY } from '@app/constants';
```

- [ ] **Step 2: Update error() method**

```typescript
  /**
   * Unified error response format (following MCP protocol)
   * Enhanced with recovery suggestions for agents
   */
  protected error(
    message: string,
    code?: string,
  ): {
    success: false;
    error: {
      message: string;
      code?: string;
      suggestions: string[];
      next_tool?: {
        name: string;
        reason: string;
        params?: Record<string, any>;
      };
    };
  } {
    const recovery = code ? MCP_ERROR_RECOVERY[code] : { suggestions: [] };

    return {
      success: false as const,
      error: {
        message,
        code,
        suggestions: recovery.suggestions,
        ...(recovery.next_tool ? { next_tool: recovery.next_tool } : {}),
      },
    };
  }
```

- [ ] **Step 3: Update executeTool() method**

Update the catch block (lines 68-71):

```typescript
    } catch (error) {
      this.logger.error(`Tool ${toolName} failed:`, error.message);
      // Extract code from McpError if available
      const errorCode = error instanceof McpError ? error.code : undefined;
      return this.error(error.message, errorCode);
    }
```

- [ ] **Step 4: Add imports (do this FIRST)**

Add imports at the top of the file (before the class definition):

```typescript
import { MCP_ERROR_RECOVERY, McpError } from '@app/constants';
```

- [ ] **Step 5: Verify TypeScript compilation**

```bash
pnpm run build -- mcp-server
```

Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/mcp-server/src/base/base-mcp-tool.service.ts
git commit -m "feat(mcp): enhance error responses with recovery suggestions

- Import MCP_ERROR_RECOVERY and McpError from @app/constants
- Update error() method to include suggestions and next_tool
- Update executeTool() to extract code from McpError
- Enhanced error format: {success, error: {message, code, suggestions, next_tool}}

Part of Phase 2: BaseMcpToolService"
```

---

## Phase 3: Update Business Logic (2-3 hours)

### Task 5: Update Indicator Service

**Files:**
- Modify: `apps/mcp-server/src/services/indicator-mcp.service.ts`

- [ ] **Step 1: Add imports**

```typescript
import { McpErrorCode, McpError } from '@app/constants';
```

- [ ] **Step 2: Add validation error code mapper**

Add after the class declaration (after line 16):

```typescript
  /**
   * Map validation error messages to error codes
   */
  private getValidationErrorCode(errorMsg: string): McpErrorCode {
    if (errorMsg.includes('must contain at least') || errorMsg.includes('elements')) {
      return McpErrorCode.INSUFFICIENT_DATA;
    }
    if (errorMsg.includes('Array length mismatch')) {
      return McpErrorCode.ARRAY_LENGTH_MISMATCH;
    }
    if (errorMsg.includes('period') && errorMsg.includes('must be at least')) {
      return McpErrorCode.INVALID_PERIOD;
    }
    if (errorMsg.includes('limit') && errorMsg.includes('must be at least')) {
      return McpErrorCode.INVALID_PARAMETER;
    }
    if (errorMsg.includes('symbol') || errorMsg.includes('Symbol cannot')) {
      return McpErrorCode.INVALID_SYMBOL;
    }
    if (errorMsg.includes('date range') || errorMsg.includes('must be before') || errorMsg.includes('Invalid date format')) {
      return McpErrorCode.INVALID_DATE_RANGE;
    }
    if (errorMsg.includes('not a valid number')) {
      return McpErrorCode.INVALID_DATA_FORMAT;
    }
    return McpErrorCode.INVALID_PARAMETER;
  }
```

- [ ] **Step 3: Update calculateMacd() error handling**

Replace line 38:
```typescript
throw new Error(pricesError);
```

With:
```typescript
throw new McpError(pricesError, this.getValidationErrorCode(pricesError));
```

- [ ] **Step 4: Update calculateRsi() error handling**

Replace line 82:
```typescript
throw new Error(periodError);
```

With:
```typescript
throw new McpError(periodError, this.getValidationErrorCode(periodError));
```

- [ ] **Step 5: Update calculateKdj() error handling (4 locations)**

Replace lines 119, 124, 129, 138, 144, 153, 162:
```typescript
throw new Error(highsError);
throw new Error(lowsError);
throw new Error(closesError);
throw new Error(lengthError);
throw new Error(periodError);
throw new Error(kSmoothingError);
throw new Error(dSmoothingError);
```

With:
```typescript
throw new McpError(highsError, this.getValidationErrorCode(highsError));
throw new McpError(lowsError, this.getValidationErrorCode(lowsError));
throw new McpError(closesError, this.getValidationErrorCode(closesError));
throw new McpError(lengthError, McpErrorCode.ARRAY_LENGTH_MISMATCH);
throw new McpError(periodError, this.getValidationErrorCode(periodError));
throw new McpError(kSmoothingError, McpErrorCode.INVALID_PARAMETER);
throw new McpError(dSmoothingError, McpErrorCode.INVALID_PARAMETER);
```

- [ ] **Step 6: Run tests**

```bash
pnpm test mcp-server -- indicator-mcp.service.spec
```

Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/mcp-server/src/services/indicator-mcp.service.ts
git commit -m "feat(mcp): use McpError in indicator service

- Add getValidationErrorCode() helper method
- Update all 6 tool methods to throw McpError with proper codes
- Map validation errors to appropriate McpErrorCode values

Part of Phase 3: Indicator Service (6 error locations)"
```

### Task 6: Update Data Service

**Files:**
- Modify: `apps/mcp-server/src/services/data-mcp.service.ts`

- [ ] **Step 1: Add imports**

```typescript
import { McpErrorCode, McpError } from '@app/constants';
```

- [ ] **Step 2: Add validation error code mapper**

Add after the class declaration (after line 27):

```typescript
  /**
   * Map validation error messages to error codes
   */
  private getValidationErrorCode(errorMsg: string): McpErrorCode {
    if (errorMsg.includes('symbol') || errorMsg.includes('Symbol cannot')) {
      return McpErrorCode.INVALID_SYMBOL;
    }
    if (errorMsg.includes('limit') && errorMsg.includes('must be at least')) {
      return McpErrorCode.INVALID_PARAMETER;
    }
    if (errorMsg.includes('date range') || errorMsg.includes('must be before') || errorMsg.includes('Invalid date format')) {
      return McpErrorCode.INVALID_DATE_RANGE;
    }
    if (errorMsg.includes('not found')) {
      return McpErrorCode.INDEX_NOT_FOUND;
    }
    if (errorMsg.includes('must contain at least') || errorMsg.includes('elements')) {
      return McpErrorCode.INSUFFICIENT_DATA;
    }
    return McpErrorCode.INVALID_PARAMETER;
  }
```

- [ ] **Step 3: Update getIndexInfo() error handling**

Replace lines 50-60:
```typescript
const symbolError = ValidationHelper.validateSymbol(symbol);
if (symbolError) {
  throw new Error(symbolError);
}

const sanitizedSymbol = ValidationHelper.sanitizeString(symbol)!;

const index = await this.indexDataRepository.findOne({
  where: { symbol: sanitizedSymbol },
});

if (!index) {
  throw new Error(
    `Index with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
  );
}
```

With:
```typescript
const symbolError = ValidationHelper.validateSymbol(symbol);
if (symbolError) {
  throw new McpError(symbolError, this.getValidationErrorCode(symbolError));
}

const sanitizedSymbol = ValidationHelper.sanitizeString(symbol)!;

const index = await this.indexDataRepository.findOne({
  where: { symbol: sanitizedSymbol },
});

if (!index) {
  throw new McpError(
    `Index with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
    McpErrorCode.INDEX_NOT_FOUND
  );
}
```

- [ ] **Step 4: Update getKlineData() error handling (3 locations)**

Replace line 103:
```typescript
throw new Error(symbolError);
```
With:
```typescript
throw new McpError(symbolError, this.getValidationErrorCode(symbolError));
```

Replace line 109:
```typescript
throw new Error(limitError);
```
With:
```typescript
throw new McpError(limitError, McpErrorCode.INVALID_PARAMETER);
```

Replace line 118:
```typescript
throw new Error(dateRangeError);
```
With:
```typescript
throw new McpError(dateRangeError, this.getValidationErrorCode(dateRangeError));
```

Replace lines 127-133:
```typescript
throw new Error(
  `Index with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
);
```
With:
```typescript
throw new McpError(
  `Index with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
  McpErrorCode.INDEX_NOT_FOUND
);
```

- [ ] **Step 5: Update getDailyKline() error handling (4 locations)**

Replace line 186:
```typescript
throw new Error(symbolError);
```
With:
```typescript
throw new McpError(symbolError, this.getValidationErrorCode(symbolError));
```

Replace line 192:
```typescript
throw new Error(limitError);
```
With:
```typescript
throw new McpError(limitError, McpErrorCode.INVALID_PARAMETER);
```

Replace line 201:
```typescript
throw new Error(dateRangeError);
```
With:
```typescript
throw new McpError(dateRangeError, this.getValidationErrorCode(dateRangeError));
```

Replace lines 210-216:
```typescript
throw new Error(
  `Index with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
);
```
With:
```typescript
throw new McpError(
  `Index with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
  McpErrorCode.INDEX_NOT_FOUND
);
```

- [ ] **Step 6: Update getLatestData() error handling**

Replace line 287:
```typescript
throw new Error(`Index with symbol ${symbol} not found`);
```

With:
```typescript
throw new McpError(`Index with symbol ${symbol} not found`, McpErrorCode.INDEX_NOT_FOUND);
```

- [ ] **Step 7: Run tests**

```bash
pnpm test mcp-server -- data-mcp.service.spec
```

Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add apps/mcp-server/src/services/data-mcp.service.ts
git commit -m "feat(mcp): use McpError in data service

- Add getValidationErrorCode() helper method
- Update all 8 tool methods to throw McpError with proper codes
- Map validation errors to appropriate McpErrorCode values
- Add INDEX_NOT_FOUND code for missing index errors

Part of Phase 3: Data Service (8 error locations)"
```

### Task 7: Update Chan Service

**Files:**
- Modify: `apps/mcp-server/src/services/chan-mcp.service.ts`

- [ ] **Step 1: Add imports**

```typescript
import { McpErrorCode, McpError } from '@app/constants';
```

- [ ] **Step 2: Add validation error code mapper**

Add after the class declaration (after line 42):

```typescript
  /**
   * Map validation error messages to error codes
   */
  private getValidationErrorCode(errorMsg: string): McpErrorCode {
    if (errorMsg.includes('must contain at least') || errorMsg.includes('elements')) {
      return McpErrorCode.INSUFFICIENT_DATA;
    }
    return McpErrorCode.INVALID_PARAMETER;
  }
```

- [ ] **Step 3: Update createBi() error handling**

Replace lines 73-82:
```typescript
const minLengthError = ValidationHelper.validateMinLength(
  k,
  3,
  'K-line data',
);
if (minLengthError) {
  throw new Error(
    minLengthError +
      ' Bi detection requires at least 3 K-lines to identify patterns.',
  );
}
```

With:
```typescript
const minLengthError = ValidationHelper.validateMinLength(
  k,
  3,
  'K-line data',
);
if (minLengthError) {
  throw new McpError(
    minLengthError +
      ' Bi detection requires at least 3 K-lines to identify patterns.',
    this.getValidationErrorCode(minLengthError)
  );
}
```

- [ ] **Step 4: Update getFenxing() error handling**

Replace lines 113-122:
```typescript
const minLengthError = ValidationHelper.validateMinLength(
  k,
  3,
  'K-line data',
);
if (minLengthError) {
  throw new Error(
    minLengthError +
      ' Fenxing detection requires at least 3 K-lines to identify patterns.',
  );
}
```

With:
```typescript
const minLengthError = ValidationHelper.validateMinLength(
  k,
  3,
  'K-line data',
);
if (minLengthError) {
  throw new McpError(
    minLengthError +
      ' Fenxing detection requires at least 3 K-lines to identify patterns.',
    this.getValidationErrorCode(minLengthError)
  );
}
```

- [ ] **Step 5: Update analyzeChanTheory() error handling**

Replace lines 153-161:
```typescript
const minLengthError = ValidationHelper.validateMinLength(
  k,
  3,
  'K-line data',
);
if (minLengthError) {
  throw new Error(
    minLengthError +
      ' Chan Theory analysis requires at least 3 K-lines to identify patterns.',
  );
}
```

With:
```typescript
const minLengthError = ValidationHelper.validateMinLength(
  k,
  3,
  'K-line data',
);
if (minLengthError) {
  throw new McpError(
    minLengthError +
      ' Chan Theory analysis requires at least 3 K-lines to identify patterns.',
    this.getValidationErrorCode(minLengthError)
  );
}
```

- [ ] **Step 6: Run tests**

```bash
pnpm test mcp-server -- chan-mcp.service.spec
```

Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/mcp-server/src/services/chan-mcp.service.ts
git commit -m "feat(mcp): use McpError in chan service

- Add getValidationErrorCode() helper method
- Update all 3 tool methods to throw McpError with proper codes
- Map INSUFFICIENT_DATA errors for validation failures

Part of Phase 3: Chan Service (3 error locations)"
```

### Task 8: Update Schedule Service

**Files:**
- Modify: `apps/mcp-server/src/services/schedule-mcp.service.ts`

- [ ] **Step 1: Add imports**

```typescript
import { McpErrorCode, McpError } from '@app/constants';
```

- [ ] **Step 2: Update getJobStatus() error handling**

Replace line 142:
```typescript
throw new Error(`Job ${jobName} not found`);
```

With:
```typescript
throw new McpError(`Job ${jobName} not found`, McpErrorCode.INVALID_PARAMETER);
```

- [ ] **Step 3: Run tests**

```bash
pnpm test mcp-server -- schedule-mcp.service.spec
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/mcp-server/src/services/schedule-mcp.service.ts
git commit -m "feat(mcp): use McpError in schedule service

- Update getJobStatus() to throw McpError
- Use INVALID_PARAMETER code for job not found

Part of Phase 3: Schedule Service (1 error location)"
```

---

## Phase 4: Testing (1 hour)

### Task 9: Update BaseMcpToolService Tests

**Files:**
- Modify: `apps/mcp-server/src/base/base-mcp-tool.service.spec.ts`

- [ ] **Step 1: Add new test suite for error recovery**

```typescript
describe('BaseMcpToolService - Error Recovery', () => {
  let service: TestMcpToolService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [TestMcpToolService],
    }).compile();

    service = module.get(TestMcpToolService);
  });

  describe('error() method', () => {
    it('should include recovery suggestions for known error codes', () => {
      const result = service.error('Not enough data', 'INSUFFICIENT_DATA');

      expect(result.success).toBe(false);
      expect(result.error.suggestions).toBeDefined();
      expect(result.error.suggestions.length).toBeGreaterThan(0);
      expect(result.error.suggestions[0]).toContain('get_kline_data');
    });

    it('should include next_tool for errors with recovery actions', () => {
      const result = service.error('Index not found', 'INDEX_NOT_FOUND');

      expect(result.success).toBe(false);
      expect(result.error.next_tool).toBeDefined();
      expect(result.error.next_tool.name).toBe('list_indices');
      expect(result.error.next_tool.reason).toContain('symbols');
    });

    it('should return empty suggestions for unknown error codes', () => {
      const result = service.error('Unknown error', 'UNKNOWN_CODE');

      expect(result.success).toBe(false);
      expect(result.error.suggestions).toEqual([]);
      expect(result.error.next_tool).toBeUndefined();
    });

    it('should preserve error message and code', () => {
      const result = service.error('Test error', 'TEST_CODE');

      expect(result.error.message).toBe('Test error');
      expect(result.error.code).toBe('TEST_CODE');
    });
  });

  describe('executeTool() method', () => {
    it('should extract error code from McpError', async () => {
      const errorFn = async () => {
        throw new McpError('Not enough data', McpErrorCode.INSUFFICIENT_DATA);
      };

      const result = await service.executeTool('test_tool', errorFn);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INSUFFICIENT_DATA');
      expect(result.error.suggestions).toBeDefined();
    });

    it('should not extract code from generic Error', async () => {
      const errorFn = async () => {
        throw new Error('Generic error');
      };

      const result = await service.executeTool('test_tool', errorFn);

      expect(result.success).toBe(false);
      expect(result.error.code).toBeUndefined();
      expect(result.error.suggestions).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test mcp-server -- base-mcp-tool.service.spec
```

Expected: All new tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/mcp-server/src/base/base-mcp-tool.service.spec.ts
git commit -m "test(mcp): add error recovery tests

- Test suggestions array is populated for known error codes
- Test next_tool is populated for errors with recovery actions
- Test error code extraction from McpError vs generic Error
- Verify backwards compatibility with unknown error codes

Part of Phase 4: Testing"
```

### Task 10: Integration Testing

- [ ] **Step 1: Run all MCP Server tests**

```bash
pnpm test mcp-server
```

Expected: All 48+ tests pass

- [ ] **Step 2: Verify error response format**

```bash
# Start MCP server in background
pnpm run start:dev:mcp-server > /tmp/mcp-test.log 2>&1 &
SERVER_PID=$!

# Wait for startup
sleep 10

# Verify server is running
if ! ps -p $SERVER_PID > /dev/null; then
  echo "❌ Server failed to start"
  cat /tmp/mcp-test.log
  exit 1
fi

echo "✅ MCP Server started (PID: $SERVER_PID)"

# Cleanup
kill $SERVER_PID 2>/dev/null || true
sleep 2
```

Expected: Server starts successfully, no errors in logs

- [ ] **Step 3: Verify TypeScript compilation**

```bash
pnpm run build
```

Expected: No compilation errors

- [ ] **Step 4: Final verification commit**

```bash
git add -A
git commit -m "test(mcp): complete error recovery implementation

Phase 1: Infrastructure - Created mcp-errors.ts with codes, class, recovery
Phase 2: BaseMcpToolService - Enhanced error() with suggestions
Phase 3: Business Logic - Updated 4 services (18 error locations)
Phase 4: Testing - Added recovery tests, all tests pass

All error responses now include:
- suggestions: Array of recovery guidance strings
- next_tool: Suggested next tool with name, reason, params

Error codes properly populated via McpError class.
Backwards compatible - new fields are optional."
```

---

## Success Criteria Verification

After implementation, verify:

- [ ] **Phase 1**: `libs/constants/src/mcp-errors.ts` created with enum, class, mapping
- [ ] **Phase 1**: `McpErrorCode` enum has 12 codes including ARRAY_LENGTH_MISMATCH
- [ ] **Phase 1**: All 12 error codes have recovery mappings in `MCP_ERROR_RECOVERY`
- [ ] **Phase 2**: `BaseMcpToolService.error()` returns suggestions and next_tool
- [ ] **Phase 2**: `BaseMcpToolService.executeTool()` extracts code from McpError
- [ ] **Phase 3**: All 4 services use `McpError` with proper codes (18 locations)
- [ ] **Phase 4**: All tests pass (48+ tests)
- [ ] **Phase 4**: New tests for error recovery pass
- [ ] **Backwards compatible**: Old error format still works

## Rollback Plan

If issues arise:

```bash
# Roll back to before implementation
git revert --no-commit HEAD~4..HEAD
git commit -m "rollback: revert error recovery implementation"

# Or reset to specific commit
git reset --hard <commit-before-phase1>
```

## Notes

- **Error code mapping**: The `getValidationErrorCode()` helper method uses string matching on error messages. This is intentional to avoid modifying `ValidationHelper` which is also used by HTTP API.
- **Priority**: Services updated in order of usage frequency: Indicators (most used), Data, Chan, Schedule
- **Testing strategy**: Each service tested independently after updates to catch issues early
- **Backwards compatibility**: New fields (`suggestions`, `next_tool`) are optional, old agents ignore them
