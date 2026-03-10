# Test Data

Frontend test data directory with fixtures and synced backend results.

## Directory Structure

```
test-data/
├── fixtures/           # Static fixtures (local)
│   ├── k-line/         # K-line fixtures
│   └── patterns/       # Pattern fixtures
├── results/            # From backend sync
│   ├── json/          # Raw JSON results
│   └── types/         # TypeScript definitions
└── index.ts           # Unified export
```

## Usage

```typescript
// Import fixtures
import { getMockKData } from '@/test-data';

// Import synced results
import { shanghaiIndex2024_2025Results } from '@/test-data/results/types';
```

## Syncing

```bash
# Manual sync from backend
pnpm run sync:from-backend
```

## Files

### Fixtures

- **csi-300-2024-2025-simple.ts** - Simple test data (89 records)
- **csi-300-2023-real.ts** - Real market data 2023 (112 records)
- **csi-300-2025-full-year.ts** - Full year 2025 data (122 records)
- **csi-300-2025-real.ts** - Real market data 2025 (large dataset)

### Results (synced from backend)

- **json/** - JSON test results from backend tests
- **types/** - TypeScript definitions for test results

## Development

The test data system provides:
- Unified export via `@/test-data` path alias
- Environment-based dataset selection
- Type-safe data access
- Automated sync from backend
