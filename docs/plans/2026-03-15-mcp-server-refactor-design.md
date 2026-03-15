# MCP Server Refactor & Optimization Design

**Date:** 2026-03-15
**Status:** Approved
**Approach:** Plan C - Refactor & Optimization

## Overview

This document outlines the comprehensive refactor and optimization of the Mist MCP Server application. The MCP (Model Context Protocol) server exposes Mist's stock analysis capabilities to AI assistants through the standard MCP protocol.

## Problem Statement

The current MCP Server implementation has several critical issues:

1. **Compilation Errors**
   - Incorrect import names: `MCPModule` should be `McpModule`
   - Wrong decorator usage: `MCPTool` should be `Tool` with Zod schemas
   - Invalid module imports: Using relative paths instead of monorepo path mappings
   - ConfigModule import error: `@app/config` does not export `ConfigModule`

2. **Code Style Inconsistency**
   - Mix of relative path imports and monorepo path mappings
   - Inconsistent naming conventions
   - Missing base classes for shared logic

3. **Testing Gap**
   - No unit tests
   - No E2E tests for MCP protocol validation
   - No test coverage metrics

4. **Documentation Gap**
   - No README or usage guide
   - No API reference for MCP tools
   - No troubleshooting guide

## Design Goals

1. **Fix all compilation errors** - Server starts and runs without errors
2. **Standardize code style** - Consistent with rest of monorepo (mist, saya, etc.)
3. **Create base architecture** - Reusable components for MCP tools
4. **Add comprehensive tests** - Unit tests + E2E tests with 80%+ coverage
5. **Provide complete documentation** - README, API reference, troubleshooting guide

## Architecture

### Directory Structure

```
apps/mcp-server/
├── src/
│   ├── main.ts                        # Application entry (ApplicationContext)
│   ├── mcp-server.module.ts           # Root module
│   ├── services/                      # MCP tool services (lowercase)
│   │   ├── chan-mcp.service.ts
│   │   ├── chan-mcp.service.spec.ts
│   │   ├── indicator-mcp.service.ts
│   │   ├── indicator-mcp.service.spec.ts
│   │   ├── data-mcp.service.ts
│   │   ├── data-mcp.service.spec.ts
│   │   ├── schedule-mcp.service.ts
│   │   └── schedule-mcp.service.spec.ts
│   ├── base/                          # Shared base classes (lowercase)
│   │   ├── base-mcp-tool.service.ts
│   │   ├── mcp-response.interceptor.ts
│   │   └── mcp-error.handler.ts
│   └── types/                         # Type definitions (lowercase)
│       └── mcp.types.ts
├── test/                              # E2E tests
│   └── mcp-server.e2e-spec.ts
├── .env                               # Environment configuration
├── .env.example
└── README.md
```

### Naming Conventions

- **Feature directories**: kebab-case (`services/`, `test/`)
- **NestJS standard directories**: lowercase (`dto/`, `types/`, `base/`)
- **Test files**: Co-located with source, `.spec.ts` suffix
- **E2E tests**: `test/*.e2e-spec.ts`

## Core Components

### 1. BaseMcpToolService

**Purpose:** Encapsulate common MCP tool logic (logging, error handling, response formatting)

**Key Features:**
- Unified success/error response formats
- Automatic logging and error handling
- Tool execution wrapper

**Location:** `src/base/base-mcp-tool.service.ts`

### 2. MCP Tool Services

**Four main service categories:**

#### ChanMcpService
- `merge_k` - Merge K-lines based on containment
- `create_bi` - Identify Bi (trend lines)
- `get_fenxing` - Get all fractals
- `create_channel` - Identify channels
- `analyze_chan_theory` - Complete pipeline

#### IndicatorMcpService
- `calculate_macd` - MACD indicator
- `calculate_rsi` - RSI indicator
- `calculate_kdj` - KDJ indicator
- `calculate_adx` - ADX indicator
- `calculate_atr` - ATR indicator
- `analyze_indicators` - Complete indicator analysis

#### DataMcpService
- `get_index_info` - Get index information
- `get_kline_data` - Get intraday K-line data
- `get_daily_kline` - Get daily K-line data
- `list_indices` - List all indices
- `get_latest_data` - Get latest data for all periods

#### ScheduleMcpService
- `trigger_data_collection` - Trigger manual collection
- `list_scheduled_jobs` - List all jobs
- `get_job_status` - Get job status
- `trigger_batch_collection` - Batch trigger
- `get_schedule_config` - Get configuration

### 3. Module Dependencies

**Key Changes:**
- Import `ChanModule` and `IndicatorModule` to reuse services
- Use `@nestjs/config` ConfigModule directly
- Fix `McpModule` import (was `MCPModule`)

```typescript
imports: [
  ConfigModule.forRoot({...}),
  TypeOrmModule.forRootAsync({...}),
  ChanModule,          // Reuse Chan services
  IndicatorModule,     // Reuse Indicator services
  McpModule.forRootAsync({...}),  // Fixed: was MCPModule
]
```

## Implementation Details

### Decorator Migration

**Before (incorrect):**
```typescript
@MCPTool('merge_k', 'Merge K-lines')
async mergeK(
  @MCPToolParam('k', 'K-line data', 'array')
  k: KLine[]
) { ... }
```

**After (correct):**
```typescript
@Tool({
  name: 'merge_k',
  description: 'Merge K-lines based on containment',
})
async mergeK(k: z.infer<typeof KLineSchema>) { ... }
```

### Parameter Validation with Zod

**Define schemas in service files:**
```typescript
const KLineSchema = z.array(z.object({
  id: z.number(),
  time: z.string(),
  open: z.number(),
  close: z.number(),
  highest: z.number(),
  lowest: z.number(),
  volume: z.number(),
  price: z.number(),
}));
```

### Error Handling

**Standard MCP error response:**
```typescript
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE"  // optional
  }
}
```

## Testing Strategy

### Unit Tests

**Location:** Co-located with source files (`*.spec.ts`)

**Coverage Goals:**
- All service methods: 80%+
- Critical paths (error handling): 100%
- Mock external dependencies (ChanModule, IndicatorModule)

**Example:**
```typescript
describe('ChanMcpService', () => {
  describe('merge_k', () => {
    it('should merge K-lines successfully', async () => {
      // Arrange
      kMergeService.merge.mockResolvedValue(expectedResult);

      // Act
      const result = await service.mergeK(mockKLine);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
    });
  });
});
```

### E2E Tests

**Location:** `test/mcp-server.e2e-spec.ts`

**Goals:**
- Verify server starts without errors
- Validate all tools are registered
- Test tool execution with valid/invalid data
- Verify MCP protocol compliance

**Test Cases:**
1. Server initialization
2. Tool registration (all 19 tools)
3. Tool execution with valid data
4. Error response format validation
5. Database interaction

### Test Commands

```json
{
  "test:mcp-server": "jest mcp-server",
  "test:mcp-server:e2e": "jest --config ./apps/mcp-server/test/jest-e2e.json",
  "test:mcp-server:watch": "jest mcp-server --watch",
  "test:mcp-server:cov": "jest mcp-server --coverage"
}
```

## Documentation

### README.md Structure

**Location:** `apps/mcp-server/README.md`

Following project conventions, all documentation is consolidated in a single README.md file:

**Sections:**
1. **Overview** - MCP Server purpose and capabilities
2. **Installation** - Setup instructions and environment configuration
3. **Usage** - How to start the server
4. **Available MCP Tools** - Categorized list of all 21 tools
5. **MCP Client Configuration** - How to connect from Claude Desktop or other MCP clients
6. **Tool API Reference** - Detailed documentation for each tool:
   - Parameters (with types)
   - Return values (with examples)
   - Usage examples
7. **Testing** - How to run unit and E2E tests
8. **Architecture** - Directory structure and design decisions
9. **Troubleshooting** - Common issues and solutions:
   - Server fails to start
   - Database connection errors
   - MCP tools not registered
   - TypeORM errors
10. **Dependencies** - Required packages and modules
11. **License** - BSD-3-Clause

This follows the same pattern as `apps/chan/README.md` and other applications in the monorepo.

## Success Criteria

1. ✅ Server starts without errors
2. ✅ All 21 MCP tools are registered and callable
3. ✅ Unit test coverage ≥ 80%
4. ✅ E2E tests pass
5. ✅ Code style consistent with monorepo standards
6. ✅ Complete README.md following project conventions (overview, API reference, troubleshooting integrated)

## Implementation Phases

### Phase 1: Fix Critical Errors (2-3 hours)
- Fix import names (McpModule, Tool)
- Fix decorator usage
- Fix module dependencies
- Fix ConfigModule import
- Verify server starts

### Phase 2: Architecture & Code Style (2-3 hours)
- Create BaseMcpToolService
- Create base classes and utilities
- Refactor services to extend base
- Standardize naming conventions
- Update all imports to use path mappings

### Phase 3: Testing (3-4 hours)
- Create unit tests for all services
- Create E2E test suite
- Add test commands to package.json
- Achieve 80%+ coverage

### Phase 4: Documentation (1-2 hours)
- Write comprehensive README.md (following apps/chan/README.md pattern)
  - Overview and quick start
  - Complete MCP tools reference (all 21 tools with examples)
  - MCP client configuration guide
  - Testing instructions
  - Troubleshooting section
- Verify all examples work correctly
- Ensure consistency with project documentation standards

**Total Estimated Time:** 8-12 hours

## Risk Mitigation

1. **Breaking changes:** Test thoroughly in development before committing
2. **Module coupling:** Import modules (ChanModule, IndicatorModule) rather than individual services
3. **Test stability:** Use mocks for external dependencies
4. **Documentation drift:** Keep docs in sync with code changes

## Next Steps

After this design is implemented:

1. Create implementation plan using `writing-plans` skill
2. Execute implementation following the plan
3. Validate against success criteria
4. Deploy and monitor

## Appendix

### MCP Tools Summary

| Category | Tools | Count |
|----------|-------|-------|
| Chan Theory | merge_k, create_bi, get_fenxing, create_channel, analyze_chan_theory | 5 |
| Indicators | calculate_macd, calculate_rsi, calculate_kdj, calculate_adx, calculate_atr, analyze_indicators | 6 |
| Data Query | get_index_info, get_kline_data, get_daily_kline, list_indices, get_latest_data | 5 |
| Schedule | trigger_data_collection, list_scheduled_jobs, get_job_status, trigger_batch_collection, get_schedule_config | 5 |
| **Total** | | **21** |

### Dependencies

- `@rekog/mcp-nest` ^1.9.7
- `@modelcontextprotocol/sdk` ^1.0.4
- `@nestjs/config` ^4.0.0
- `zod` ^4.1.0
- `ChanModule` (internal)
- `IndicatorModule` (internal)
