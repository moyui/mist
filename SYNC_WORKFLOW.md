# Test Data Sync Workflow

## 📚 Understanding the Structure

### Two Types of Data

**1. Fixtures (输入数据 - 原始K线)**
- Location: `test-data/fixtures/k-line/`
- Files: `shanghai-index-2024-2025.fixture.ts`, `csi-300-*.ts`
- Purpose: Test input data (raw K-line data)
- Usage: Backend tests read these files as input

**2. Test Results (输出数据 - 计算结果)**
- Location: `test-data/test-results/raw/`
- Files: `shanghai-index-2024-2025-results.json`, etc.
- Purpose: Computed results (mergeK, bi, channels, fenxing)
- Usage: Frontend displays these results in charts

## 🔄 Complete Sync Workflow

### Step 1: Run Backend Tests (生成测试结果)
```bash
cd /Users/xiyugao/code/mist/mist
pnpm run test:chan:shanghai-2024-2025
```
**Output**: JSON files in `test-data/test-results/raw/`

### Step 2: Generate TypeScript Types (生成类型定义)
```bash
node tools/generate-type-definitions.mjs
```
**Output**: `.ts` files in `test-data/test-results/types/`
- Contains both type definitions AND data exports
- Imports JSON from `../raw/` directory

### Step 3: Sync to Frontend (同步到前端)
```bash
pnpm run test:sync
```
**Does**:
1. Copies JSON from `test-data/test-results/raw/` → `mist-fe/test-data/results/json/`
2. Copies `.ts` from `test-data/test-results/types/` → `mist-fe/test-data/results/types/`
3. Updates `test-data/results/types/index.ts` with exports

### Step 4: Use in Frontend (前端使用)
```typescript
import { shanghaiIndex20242025Results } from '@/test-data/results/types';

// Use the data
const kData = shanghaiIndex20242025Results.data.originalKLines;
const summary = shanghaiIndex20242025Results.summary;
```

## 🚀 Quick Sync Command

Do all at once:
```bash
pnpm run test:full
```

This runs: `test` → `test:sync`

## 📁 Directory Structure

```
mist/ (backend)
├── test-data/
│   ├── fixtures/k-line/           # Input: Raw K-line data
│   │   └── shanghai-index-2024-2025.fixture.ts
│   └── test-results/
│       ├── raw/                    # JSON results (from tests)
│       │   ├── shanghai-index-2024-2025-results.json
│       │   └── ...
│       └── types/                  # TypeScript definitions
│           ├── shanghai-index-2024-2025-results.ts
│           └── ...

mist-fe/ (frontend)
├── test-data/
│   ├── fixtures/k-line/           # Mirrored from backend
│   └── results/
│       ├── json/                   # Synced from backend/raw/
│       │   ├── shanghai-index-2024-2025-results.json
│       │   └── ...
│       └── types/                  # Synced from backend/types/
│           ├── shanghai-index-2024-2025-results.ts
│           └── index.ts
```

## 🛠️ Available Scripts

**Backend:**
- `pnpm run test:sync` - Sync test results to frontend
- `pnpm run test:gen-types` - Generate TypeScript definitions
- `pnpm run test:full` - Run tests + sync

**Frontend:**
- `pnpm run sync:from-backend` - Pull latest data from backend
- `pnpm run dev:sync` - Sync + start dev server

## ✅ Verification

Check if sync succeeded:
```bash
# Backend
ls test-data/test-results/raw/*.json

# Frontend
ls test-data/results/json/*.json
ls test-data/results/types/*.ts
```
