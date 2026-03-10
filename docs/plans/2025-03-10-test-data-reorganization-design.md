# Test Data Reorganization Design

**Date**: 2025-03-10
**Status**: Approved
**Author**: Claude Code

## Executive Summary

This document describes a comprehensive plan to reorganize test data across the Mist project's frontend and backend repositories. The goal is to establish a unified, standardized approach to test data management with clear separation of concerns, automated synchronization, and type safety.

## Problem Statement

### Current Issues

1. **Inconsistent Naming**: Mix of `.fixture.ts`, `.data.json`, and `-results.json` formats
2. **Scattered Locations**: Test data spread across multiple directories in both repositories
3. **Data Duplication**: Same data exists in both frontend and backend
4. **Manual Sync Process**: Frontend requires manual copying of backend test results
5. **No Unified Export**: Backend lacks a single entry point for test data
6. **Missing Type Safety**: Frontend lacks proper TypeScript definitions for backend data

### Goals

- ✅ Unified directory structure and naming conventions
- ✅ Eliminate data duplication through single source of truth
- ✅ Automated synchronization via pnpm scripts
- ✅ Type-safe data sharing with TypeScript definitions
- ✅ Clear separation: fixtures (input) vs test-results (output)
- ✅ Backend as primary data source

## Proposed Solution

### Architecture Overview

```
code/
├── mist/                          # Backend repository
│   ├── test-data/                 # New unified data root
│   │   ├── fixtures/              # Test input data
│   │   │   ├── k-line/            # K-line raw data
│   │   │   └── patterns/          # Special patterns
│   │   └── test-results/          # Test output results
│   │       ├── raw/               # JSON output
│   │       └── types/             # TypeScript definitions
│   └── scripts/
│       ├── sync-test-data.js     # Main sync script
│       └── generate-type-definitions.js
│
└── mist-fe/                       # Frontend repository
    ├── test-data/                 # Test data directory
    │   ├── fixtures/              # Local fixtures
    │   │   ├── k-line/
    │   │   └── patterns/
    │   └── results/               # Synced from backend
    │       ├── json/              # Raw JSON
    │       └── types/             # TypeScript definitions
    ├── scripts/
    │   └── sync-from-backend.js   # Receive sync data
    └── app/api/
        └── fetch.ts               # Updated imports
```

### Data Flow

```mermaid
graph LR
    A[Backend Tests Run] --> B[Generate test-results/raw/*.json]
    B --> C[pnpm run test:sync]
    C --> D[Copy to mist-fe/test-data/results/json/]
    D --> E[Generate TypeScript types]
    E --> F[Update mist-fe/test-data/results/types/]
    F --> G[Frontend uses via @/test-data]
```

## File Naming Conventions

### Fixtures (Input Data)
- Pattern: `{index}-{year-range}.{type}.fixture.ts`
- Examples:
  - `csi300-2025.fixture.ts`
  - `shanghai-index-2024-2025.fixture.ts`
  - `shenzhen-component-2023-2024.fixture.ts`

### Test Results (Output Data)
- Pattern: `{index}-{year-range}-results.json`
- Examples:
  - `shanghai-index-2024-2025-results.json`
  - `csi300-2025-results.json`

## Data Format Standards

### Fixture Metadata Template

```typescript
export const dataSetName: KVo[] = [
  { id: 1, symbol: '000001', time: new Date('...'), ... }
];

export const metadata = {
  name: 'Dataset Name',
  symbol: '000001',
  description: 'Brief description',
  source: 'AKTools',
  dateRange: { start: '2024-01-02', end: '2025-12-05' },
  records: 485,
  generatedAt: new Date().toISOString(),
};
```

### Test Results JSON Structure

All test results follow this standardized format:

```json
{
  "version": "1.0.0",
  "metadata": {
    "testName": "...",
    "timestamp": "...",
    "dataSource": {...},
    "dataRange": {...},
    "testConfig": {...}
  },
  "marketStats": {...},
  "summary": {
    "originalKLines": 485,
    "mergedKLines": 344,
    "totalBis": 37,
    "totalChannels": 5
  },
  "biStatistics": {...},
  "data": {
    "originalKLines": [...],
    "mergeK": [...],
    "bis": [...],
    "channels": [...],
    "fenxings": [...]
  },
  "validation": {...}
}
```

## Backend Implementation

### Directory Structure Creation

```bash
cd mist
mkdir -p test-data/fixtures/k-line
mkdir -p test-data/fixtures/patterns
mkdir -p test-data/test-results/raw
mkdir -p test-data/test-results/types
```

### File Moves

```bash
# K-line data
mv apps/mist/src/chan/test/fixtures/shanghai-index-2024.fixture.ts \
   test-data/fixtures/k-line/

mv apps/mist/src/chan/test/fixtures/shanghai-index-2024-2025.fixture.ts \
   test-data/fixtures/k-line/

mv apps/mist/src/chan/test/fixtures/csi300-2025.fixture.ts \
   test-data/fixtures/k-line/

# Pattern data
mv apps/mist/src/chan/test/fixtures/k-line-fixtures.ts \
   test-data/fixtures/patterns/

# JSON data
mv apps/mist/src/chan/test/fixtures/shanghai-index-2024.data.json \
   test-data/fixtures/k-line/
```

### Test Import Path Updates

**Old path**:
```typescript
import { data } from './fixtures/shanghai-index-2024-2025.fixture';
```

**New path** (5 levels up):
```typescript
import { data } from '../../../../../test-data/fixtures/k-line/shanghai-index-2024-2025.fixture';
```

### PNPM Scripts Configuration

**Backend `package.json`**:
```json
{
  "scripts": {
    "test": "jest",
    "test:sync": "node scripts/sync-test-data.js",
    "test:gen-types": "node scripts/generate-type-definitions.js",
    "test:full": "pnpm run test && pnpm run test:sync"
  }
}
```

## Frontend Implementation

### Directory Structure Creation

```bash
cd mist-fe
mkdir -p test-data/fixtures/k-line
mkdir -p test-data/fixtures/patterns
mkdir -p test-data/results/json
mkdir -p test-data/results/types
```

### Existing Data Migration

```bash
# Move K-line fixtures
mv app/api/__tests__/fixtures/k-line-data/* \
   test-data/fixtures/k-line/

# Move README
mv app/api/__tests__/fixtures/README.md \
   test-data/README.md
```

### Import Path Updates

**Old paths**:
```typescript
import { getMockData } from "./__tests__/fixtures";
import { shanghaiIndex2024_2025TestData } from "@/app/api/mock-data/...";
```

**New paths**:
```typescript
import { getMockData } from "@/test-data";
import { shanghaiIndex2024_2025Results } from "@/test-data/results/types";
```

### TypeScript Path Aliases

**`tsconfig.json`**:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"],
      "@/test-data": ["./test-data/index.ts"],
      "@/test-data/*": ["./test-data/*"]
    }
  }
}
```

### PNPM Scripts Configuration

**Frontend `package.json`**:
```json
{
  "scripts": {
    "dev": "next dev",
    "dev:sync": "pnpm sync:from-backend && next dev",
    "sync:from-backend": "node scripts/sync-from-backend.js"
  }
}
```

## Type Safety

### Backend Types

All data uses backend VO definitions:
- `KVo` - K-line data
- `BiVo` - Trend lines (Bi)
- `ChannelVo` - Channels (Zhongshu)
- `FenxingVo` - Fittings (Fenxing)
- `MergedKVo` - Merged K-lines

### Frontend Types

Frontend defines its own types matching backend VOs:
```typescript
export interface IFetchK {
  id: number;
  symbol: string;
  time: Date | string;
  amount: number;
  open: number;
  close: number;
  highest: number;
  lowest: number;
}

// ... other interfaces
```

This ensures type safety while maintaining repository independence.

## Synchronization Scripts

### Backend Script: `scripts/sync-test-data.js`

Features:
1. Validates frontend repository exists
2. Checks test result files are present
3. Invokes frontend sync script via pnpm
4. Generates TypeScript type definitions
5. Verifies sync success

Usage:
```bash
cd mist
pnpm run test:sync  # Sync only
pnpm run test:full  # Run tests + sync
```

### Frontend Script: `scripts/sync-from-backend.js`

Features:
1. Validates backend repository
2. Copies JSON files from backend
3. Copies type definitions from backend
4. Updates index files
5. Displays usage hints

Usage:
```bash
cd mist-fe
pnpm run sync:from-backend
```

## Type Definition Generation

Backend generates TypeScript definitions for test results:

**Input**: `test-results/raw/shanghai-index-2024-2025-results.json`

**Output**: `test-results/types/shanghai-index-2024-2025-results.ts`

Contains:
- Interface definitions matching backend VOs
- Type assertions for JSON data
- Convenience exports (kLines, bis, channels, etc.)
- Helper functions (getDataInRange, getStats, etc.)

## Migration Phases

### Phase 1: Backend Restructuring (Independent)

1. Create new directory structure
2. Move fixture files
3. Update test import paths
4. Add metadata to fixtures
5. Adjust test result output paths
6. Delete old fixture directory

### Phase 2: Establish Sync Mechanism

1. Create sync scripts
2. Update package.json scripts
3. First sync test
4. Verify data flow

### Phase 3: Frontend Adaptation

1. Create new frontend structure
2. Move existing fixtures
3. Create unified exports
4. Update import paths
5. Run sync and verify

### Phase 4: Cleanup

1. Delete old directories
2. Update documentation
3. Add .gitignore rules
4. Final verification

## Rollback Plan

If issues occur:

**Backend**:
```bash
cd mist
git checkout apps/mist/src/chan/test/fixtures/
# Restore test output paths
```

**Frontend**:
```bash
cd mist-fe
git checkout app/api/__tests__/fixtures/
git checkout app/api/mock-data/
```

## Success Criteria

- [ ] Backend tests run successfully with new structure
- [ ] Test results generated to `test-data/test-results/raw/`
- [ ] Sync scripts execute without errors
- [ ] Frontend receives updated data
- [ ] Type definitions generated correctly
- [ ] Frontend builds and runs without errors
- [ ] All import paths updated and working
- [ ] Documentation updated
- [ ] Old directories removed

## Documentation Updates

1. `/Users/xiyugao/code/mist/CLAUDE.md` - Add test data management chapter
2. `mist/CLAUDE.md` - Update test directory structure
3. `mist-fe/CLAUDE.md` - Update test data section
4. `mist-fe/test-data/README.md` - Comprehensive usage guide

## Technical Considerations

### Relative Paths

Key paths to remember:
- Test file to fixtures: `../../../../../test-data/fixtures/k-line/` (5 levels up)
- Types to backend VOs: `../../../../apps/mist/src/chan/vo/`
- Frontend usage: `@/test-data` (aliased)

### Type Compatibility

Frontend types are maintained separately but kept in sync with backend VOs. When backend VO definitions change, regenerate frontend type definitions.

## Future Improvements

1. CI/CD integration for automatic sync on commits
2. Data validation scripts to ensure format consistency
3. Version tracking for test data datasets
4. Automated diff viewing for data changes
5. Performance optimization for large datasets

## Appendix

### File Migration Checklist

**Backend**:
- [ ] `shanghai-index-2024.fixture.ts`
- [ ] `shanghai-index-2024-2025.fixture.ts`
- [ ] `csi300-2025.fixture.ts`
- [ ] `k-line-fixtures.ts`
- [ ] `shanghai-index-2024.data.json`
- [ ] All test spec files updated

**Frontend**:
- [ ] K-line fixtures moved
- [ ] Import paths updated
- [ ] Unified exports created
- [ ] tsconfig.json updated

### Script Templates

See detailed implementation in design sections above.
