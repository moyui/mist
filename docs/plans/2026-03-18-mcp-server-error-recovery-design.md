# MCP Server Agent-Friendly Error Recovery Design

**Date**: 2026-03-18
**Status**: Design
**Priority**: P0 (Critical for Agent Experience)

## Overview

Enhance MCP Server error responses to provide AI agents with actionable recovery guidance. When tool calls fail, agents should receive clear suggestions on how to fix the error and what to do next.

## Problem Statement

### Current State

**Error Code Location:**
- Currently defined in: `apps/mcp-server/src/utils/validation.helpers.ts` (lines 6-25)
- **Issue**: Should be in shared library (`libs/constants`) for reuse
- **Issue**: Defined but NOT used in business logic
- **Issue**: All throws use generic `Error`, not `McpError` with codes

**Current Error Response:**
```json
{
  "success": false,
  "error": {
    "message": "K-line data must contain at least 26 elements, received: 10",
    "code": "INSUFFICIENT_DATA"
  }
}
```

**Note**: `error.code` is currently always `undefined` because standard `Error` objects don't have a `code` property.

**Problems:**
1. Error codes in wrong location (should be in `libs/constants`)
2. Business logic throws `new Error()`, not `McpError` with codes
3. `error.code` field is never populated
4. No recovery guidance for agents
5. No next step suggestions

## Design Goals

1. **Move error codes to shared library** - `libs/constants/src/mcp-errors.ts`
2. **Use McpError consistently** - All throws use `McpError` with proper codes
3. **Recovery suggestions** - Tell agents what to do
4. **Next tool guidance** - Suggest the next tool to call
5. **ValidationHelper integration** - Map validation errors to error codes
6. **Backwards compatible** - Extend existing error format

## Architecture

### File Structure

```
libs/constants/src/
├── errors.ts              # Existing: HTTP API error messages
├── mcp-errors.ts          # New: MCP error codes, Error class, recovery mapping
└── index.ts               # Export all

apps/mcp-server/src/
├── base/
│   └── base-mcp-tool.service.ts  # Enhanced error() method, executeTool()
├── services/
│   ├── chan-mcp.service.ts       # Use McpError
│   ├── indicator-mcp.service.ts  # Use McpError
│   ├── data-mcp.service.ts       # Use McpError
│   └── schedule-mcp.service.ts   # Use McpError
└── utils/
    └── validation.helpers.ts     # Remove McpErrorCode enum (moved to constants)
```

### Enhanced Error Response Format

```json
{
  "success": false,
  "error": {
    "message": "K-line data must contain at least 26 elements, received: 10",
    "code": "INSUFFICIENT_DATA",
    "suggestions": [
      "Get more data using get_kline_data with larger limit",
      "Use a different indicator requiring fewer data points (e.g., RSI needs 14)"
    ],
    "next_tool": {
      "name": "get_kline_data",
      "reason": "Fetch more historical data",
      "params": {
        "limit": 100
      }
    }
  }
}
```

## Components

### 1. McpErrorCode Enum

**Location:** `libs/constants/src/mcp-errors.ts`

**Move from:** `apps/mcp-server/src/utils/validation.helpers.ts` (lines 6-25)

**Enhancement:** Add `ARRAY_LENGTH_MISMATCH`

```typescript
export enum McpErrorCode {
  // Validation errors (100-199)
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  INVALID_PERIOD = 'INVALID_PERIOD',
  INVALID_SYMBOL = 'INVALID_SYMBOL',
  ARRAY_LENGTH_MISMATCH = 'ARRAY_LENGTH_MISMATCH',  // NEW

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

### 2. McpError Class

**Location:** `libs/constants/src/mcp-errors.ts`

```typescript
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

### 3. Error Recovery Mapping

**Location:** `libs/constants/src/mcp-errors.ts`

```typescript
export const MCP_ERROR_RECOVERY: Record<string, {
  suggestions: string[];
  nextTool?: {
    name: string;
    reason: string;
    params?: Record<string, any>;
  };
}> = {
  // Validation errors
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

  // Not found errors
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

  // Data errors
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

  // Calculation errors
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

### 4. ValidationHelper Integration

**Issue:** `ValidationHelper` methods return error message strings, not error codes.

**Solution:** Create a mapping function in each service that maps validation errors to `McpErrorCode`.

**Example in `indicator-mcp.service.ts`:**

```typescript
private getValidationErrorCode(errorMsg: string): McpErrorCode {
  if (errorMsg.includes('must contain at least') || errorMsg.includes('elements')) {
    return McpErrorCode.INSUFFICIENT_DATA;
  }
  if (errorMsg.includes('Array length mismatch')) {
    return McpErrorCode.ARRAY_LENGTH_MISMATCH;
  }
  if (errorMsg.includes('must be at least') && errorMsg.includes('period')) {
    return McpErrorCode.INVALID_PERIOD;
  }
  return McpErrorCode.INVALID_PARAMETER;
}

// Usage:
async calculateMacd(prices: z.infer<typeof PricesSchema>) {
  return this.executeTool('calculate_macd', async () => {
    const pricesError = ValidationHelper.validatePrices(prices);
    if (pricesError) {
      throw new McpError(pricesError, this.getValidationErrorCode(pricesError));
    }
    // ... rest of implementation
  });
}
```

### 5. Enhanced BaseMcpToolService

**Location:** `apps/mcp-server/src/base/base-mcp-tool.service.ts`

```typescript
import { MCP_ERROR_RECOVERY } from '@app/constants';

export abstract class BaseMcpToolService {
  protected readonly logger: Logger;

  constructor(name: string) {
    this.logger = new Logger(name);
  }

  protected success<T>(
    data: T,
    meta?: Record<string, any>,
  ): { success: true; data: T } & Record<string, any> {
    return {
      success: true as const,
      data,
      ...meta,
    };
  }

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

  protected async executeTool<T>(
    toolName: string,
    fn: () => Promise<T>,
  ): Promise<
    | { success: true; data: T }
    | {
        success: false;
        error: {
          message: string;
          code?: string;
          suggestions: string[];
          next_tool?: any;
        };
      }
  > {
    this.logger.debug(`Executing tool: ${toolName}`);
    try {
      const result = await fn();
      this.logger.debug(`Tool ${toolName} completed successfully`);
      return this.success(result);
    } catch (error) {
      this.logger.error(`Tool ${toolName} failed:`, error.message);
      // Extract code from McpError if available
      const errorCode = error instanceof McpError ? error.code : undefined;
      return this.error(error.message, errorCode);
    }
  }
}
```

**Key change:** `error instanceof McpError` check to extract error code.

## Implementation Strategy

### Phase 1: Infrastructure (1-2 hours)

**Step 1.1:** Create `libs/constants/src/mcp-errors.ts`

- Define `McpErrorCode` enum (move from `validation.helpers.ts`, add `ARRAY_LENGTH_MISMATCH`)
- Define `McpError` class
- Define `MCP_ERROR_RECOVERY` mapping

**Step 1.2:** Update `libs/constants/src/index.ts`

```typescript
export * from './errors';
export * from './mcp-errors';
```

**Step 1.3:** Update `apps/mcp-server/src/utils/validation.helpers.ts`

- Remove `McpErrorCode` enum (moved to constants)
- Keep all `ValidationHelper` methods unchanged
- Add import comment: `// Error codes moved to @app/constants`

### Phase 2: Enhance BaseMcpToolService (30 minutes)

**Step 2.1:** Update `error()` method

- Import `MCP_ERROR_RECOVERY` from `@app/constants`
- Add `suggestions` and `next_tool` to return type
- Look up recovery suggestions by error code

**Step 2.2:** Update `executeTool()` method

- Add `instanceof McpError` check
- Extract `error.code` from `McpError` instances
- Pass code to `error()` method

### Phase 3: Update Business Logic (2-3 hours)

**For each service file:**

1. **Add import:**
   ```typescript
   import { McpErrorCode, McpError } from '@app/constants';
   ```

2. **Add validation error code mapper:**
   ```typescript
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
     if (errorMsg.includes('symbol') || errorMsg.includes('Symbol cannot')) {
       return McpErrorCode.INVALID_SYMBOL;
     }
     if (errorMsg.includes('date range') || errorMsg.includes('must be before')) {
       return McpErrorCode.INVALID_DATE_RANGE;
     }
     return McpErrorCode.INVALID_PARAMETER;
   }
   ```

3. **Update all throw statements:**
   ```typescript
   // Before
   throw new Error(pricesError);
   throw new Error(`Index with symbol "${symbol}" not found`);

   // After
   throw new McpError(pricesError, this.getValidationErrorCode(pricesError));
   throw new McpError(
     `Index with symbol "${sanitizedSymbol}" not found...`,
     McpErrorCode.INDEX_NOT_FOUND
   );
   ```

**Services to update:**

| Service | Throws to Update | Priority |
|---------|-----------------|----------|
| `indicator-mcp.service.ts` | 6 locations | High |
| `data-mcp.service.ts` | 8 locations | High |
| `chan-mcp.service.ts` | 3 locations | Medium |
| `schedule-mcp.service.ts` | 1 location | Low |

### Phase 4: Testing (1 hour)

**Step 4.1:** Update unit tests

- Tests now expect `suggestions` array in error responses
- Tests verify `next_tool` is populated when appropriate
- Tests verify `McpError` is thrown with correct codes

**Step 4.2:** Add new test cases

```typescript
describe('BaseMcpToolService - Error Recovery', () => {
  it('should include recovery suggestions for INSUFFICIENT_DATA', () => {
    const error = service.error('Not enough data', 'INSUFFICIENT_DATA');
    expect(error.error.suggestions).toHaveLength(2);
    expect(error.error.suggestions[0]).toContain('get_kline_data');
  });

  it('should include next_tool for INDEX_NOT_FOUND', () => {
    const error = service.error('Index not found', 'INDEX_NOT_FOUND');
    expect(error.error.next_tool).toBeDefined();
    expect(error.error.next_tool.name).toBe('list_indices');
  });
});
```

**Step 4.3:** Integration test

- Trigger actual error conditions
- Verify error response format
- Test with sample agent queries

## Error Code Mapping Reference

| Error Code | Validation Pattern | Recovery Action | Next Tool |
|------------|-------------------|-----------------|-----------|
| `INSUFFICIENT_DATA` | "must contain at least X elements" | Get more data | `get_kline_data` |
| `INDEX_NOT_FOUND` | "not found" | List symbols | `list_indices` |
| `INVALID_SYMBOL` | "Symbol cannot be empty" | List symbols | `list_indices` |
| `INVALID_PERIOD` | "period must be at least X" | Use valid value | - |
| `INVALID_DATE_RANGE` | "must be before" | Fix dates | - |
| `ARRAY_LENGTH_MISMATCH` | "Array length mismatch" | Fix arrays | - |
| `INVALID_PARAMETER` | (catch-all) | Check params | - |
| `DATA_NOT_FOUND` | "not found" | Check availability | - |
| `CALCULATION_ERROR` | (catch-all) | Check data | - |

## Backwards Compatibility

✅ **Fully backwards compatible**

- Existing fields (`message`, `code`) unchanged
- New fields (`suggestions`, `next_tool`) are optional
- Error responses without new fields still work
- HTTP API not affected (different error handling via `HttpException`)

## Migration Examples

### Example 1: Indicator Service

**Before:**
```typescript
async calculateMacd(prices: z.infer<typeof PricesSchema>) {
  return this.executeTool('calculate_macd', async () => {
    const pricesError = ValidationHelper.validatePrices(prices);
    if (pricesError) {
      throw new Error(pricesError);
    }
    // ...
  });
}
```

**After:**
```typescript
async calculateMacd(prices: z.infer<typeof PricesSchema>) {
  return this.executeTool('calculate_macd', async () => {
    const pricesError = ValidationHelper.validatePrices(prices);
    if (pricesError) {
      throw new McpError(pricesError, this.getValidationErrorCode(pricesError));
    }
    // ...
  });
}
```

### Example 2: Data Service

**Before:**
```typescript
if (!index) {
  throw new Error(
    `Index with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`
  );
}
```

**After:**
```typescript
if (!index) {
  throw new McpError(
    `Index with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
    McpErrorCode.INDEX_NOT_FOUND
  );
}
```

## Success Criteria

1. ✅ `McpErrorCode` enum moved to `libs/constants/src/mcp-errors.ts`
2. ✅ `ARRAY_LENGTH_MISMATCH` added to enum
3. ✅ All error codes have recovery mappings
4. ✅ `McpError` class defined and used
5. ✅ `BaseMcpToolService` enhanced with recovery suggestions
6. ✅ All services use `McpError` with proper codes
7. ✅ All existing tests pass
8. ✅ New tests for error recovery
9. ✅ Backwards compatible (no breaking changes)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Validation error mapping incomplete | Medium | Provide helper method with common patterns |
| Wrong error code used | Medium | Clear mapping documentation, examples |
| Performance overhead | Low | Static lookup O(1), minimal impact |
| Breaking existing agents | Low | Additive changes only, optional fields |

## Timeline Estimate

- **Phase 1**: 1-2 hours (Infrastructure)
- **Phase 2**: 30 minutes (Base class)
- **Phase 3**: 2-3 hours (Business logic)
- **Phase 4**: 1 hour (Testing)
- **Total**: 4.5-6.5 hours

## Future Enhancements

Out of scope but worth considering:

1. **Dynamic recovery suggestions** - Based on actual parameter values
2. **Error localization** - Support for multiple languages
3. **Error telemetry** - Track which errors occur most frequently
4. **Smart recovery** - Suggest alternative tools based on context
5. **Recovery automation** - Agent can auto-retry with corrected params
6. **ValidationHelper enhancement** - Return `{ message, code }` instead of just `message`

## References

- Existing error codes: `apps/mcp-server/src/utils/validation.helpers.ts` (lines 6-25)
- HTTP API errors: `libs/constants/src/errors.ts`
- MCP protocol specification
- Current tool implementations: `apps/mcp-server/src/services/*.ts`
- BaseMcpToolService: `apps/mcp-server/src/base/base-mcp-tool.service.ts`
