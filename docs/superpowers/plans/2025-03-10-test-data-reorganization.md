# Test Data Reorganization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize test data across mist (backend) and mist-fe (frontend) repositories with unified structure, automated synchronization, and type safety.

**Architecture:** Backend generates test results to `test-data/test-results/raw/`, frontend syncs via pnpm scripts, both maintain type definitions matching backend VO structures.

**Tech Stack:** Node.js scripts, pnpm workspace (cross-repo), TypeScript type generation, Jest testing

---

## Task 1: Create backend test-data directory structure

**Files:**
- Create: `test-data/fixtures/k-line/.gitkeep`
- Create: `test-data/fixtures/patterns/.gitkeep`
- Create: `test-data/test-results/raw/.gitkeep`
- Create: `test-data/test-results/types/.gitkeep`

**Step 1: Create directory structure**

```bash
cd /Users/xiyugao/code/mist/mist
mkdir -p test-data/fixtures/k-line
mkdir -p test-data/fixtures/patterns
mkdir -p test-data/test-results/raw
mkdir -p test-data/test-results/types
```

**Step 2: Create .gitkeep files**

```bash
touch test-data/fixtures/k-line/.gitkeep
touch test-data/fixtures/patterns/.gitkeep
touch test-data/test-results/raw/.gitkeep
touch test-data/test-results/types/.gitkeep
```

**Step 3: Verify structure**

```bash
tree test-data/ -L 3
```

Expected: Directory tree with all 4 subdirectories

**Step 4: Commit**

```bash
git add test-data/
git commit -m "feat(test-data): create unified test data directory structure

- Add fixtures/k-line for K-line input data
- Add fixtures/patterns for test pattern data
- Add test-results/raw for JSON output
- Add test-results/types for TypeScript definitions
```

---

## Task 2: Move K-line fixture files to new location

**Files:**
- Move: `apps/mist/src/chan/test/fixtures/shanghai-index-2024.fixture.ts` → `test-data/fixtures/k-line/shanghai-index-2024.fixture.ts`
- Move: `apps/mist/src/chan/test/fixtures/shanghai-index-2024-2025.fixture.ts` → `test-data/fixtures/k-line/shanghai-index-2024-2025.fixture.ts`
- Move: `apps/mist/src/chan/test/fixtures/csi300-2025.fixture.ts` → `test-data/fixtures/k-line/csi300-2025.fixture.ts`

**Step 1: Move shanghai-index-2024.fixture.ts**

```bash
mv apps/mist/src/chan/test/fixtures/shanghai-index-2024.fixture.ts \
   test-data/fixtures/k-line/
```

**Step 2: Move shanghai-index-2024-2025.fixture.ts**

```bash
mv apps/mist/src/chan/test/fixtures/shanghai-index-2024-2025.fixture.ts \
   test-data/fixtures/k-line/
```

**Step 3: Move csi300-2025.fixture.ts**

```bash
mv apps/mist/src/chan/test/fixtures/csi300-2025.fixture.ts \
   test-data/fixtures/k-line/
```

**Step 4: Verify files moved**

```bash
ls -la test-data/fixtures/k-line/
```

Expected: 3 .fixture.ts files present

**Step 5: Commit**

```bash
git add test-data/fixtures/k-line/
git commit -m "refactor(test-data): move K-line fixtures to unified location

- Move shanghai-index-2024.fixture.ts to test-data/fixtures/k-line/
- Move shanghai-index-2024-2025.fixture.ts to test-data/fixtures/k-line/
- Move csi300-2025.fixture.ts to test-data/fixtures/k-line/
```

---

## Task 3: Move pattern fixture file

**Files:**
- Move: `apps/mist/src/chan/test/fixtures/k-line-fixtures.ts` → `test-data/fixtures/patterns/k-line-fixtures.ts`

**Step 1: Move file**

```bash
mv apps/mist/src/chan/test/fixtures/k-line-fixtures.ts \
   test-data/fixtures/patterns/
```

**Step 2: Verify**

```bash
ls -la test-data/fixtures/patterns/
```

Expected: k-line-fixtures.ts present

**Step 3: Commit**

```bash
git add test-data/fixtures/patterns/
git commit -m "refactor(test-data): move pattern fixtures to patterns directory

- Move k-line-fixtures.ts to test-data/fixtures/patterns/
```

---

## Task 4: Move JSON fixture file

**Files:**
- Move: `apps/mist/src/chan/test/fixtures/shanghai-index-2024.data.json` → `test-data/fixtures/k-line/shanghai-index-2024.data.json`

**Step 1: Move file**

```bash
mv apps/mist/src/chan/test/fixtures/shanghai-index-2024.data.json \
   test-data/fixtures/k-line/
```

**Step 2: Verify**

```bash
ls -la test-data/fixtures/k-line/ | grep json
```

Expected: shanghai-index-2024.data.json present

**Step 3: Commit**

```bash
git add test-data/fixtures/k-line/
git commit -m "refactor(test-data): move JSON fixture to k-line directory

- Move shanghai-index-2024.data.json to test-data/fixtures/k-line/
```

---

## Task 5: Update test file import paths

**Files:**
- Modify: `apps/mist/src/chan/test/shanghai-index-2024-2025.spec.ts`
- Modify: `apps/mist/src/chan/test/shanghai-index-2024.spec.ts`
- Modify: `apps/mist/src/chan/test/csi300-2025.spec.ts`

**Step 1: Update shanghai-index-2024-2025.spec.ts**

Open: `apps/mist/src/chan/test/shanghai-index-2024-2025.spec.ts`

Find import:
```typescript
import { shanghaiIndexData2024_2025 } from './fixtures/shanghai-index-2024-2025.fixture';
```

Replace with:
```typescript
import { shanghaiIndexData2024_2025 } from '../../../../../test-data/fixtures/k-line/shanghai-index-2024-2025.fixture';
```

**Step 2: Update shanghai-index-2024.spec.ts**

Open: `apps/mist/src/chan/test/shanghai-index-2024.spec.ts`

Find and replace import paths from `./fixtures/` to `../../../../../test-data/fixtures/k-line/`

**Step 3: Update csi300-2025.spec.ts**

Open: `apps/mist/src/chan/test/csi300-2025.spec.ts`

Find and replace import paths from `./fixtures/` to `../../../../../test-data/fixtures/k-line/`

**Step 4: Verify no broken imports**

```bash
grep -r "from './fixtures/" apps/mist/src/chan/test/
```

Expected: No results (all imports updated)

**Step 5: Run tests to verify**

```bash
pnpm run test:chan:shanghai-2024-2025
```

Expected: Tests pass with new import paths

**Step 6: Commit**

```bash
git add apps/mist/src/chan/test/
git commit -m "refactor(test-data): update test import paths to new fixture location

- Update imports in shanghai-index-2024-2025.spec.ts
- Update imports in shanghai-index-2024.spec.ts
- Update imports in csi300-2025.spec.ts
- All imports now point to ../../../../../test-data/fixtures/k-line/
```

---

## Task 6: Create main sync script

**Files:**
- Create: `scripts/sync-test-data.js`

**Step 1: Create sync script**

Create: `scripts/sync-test-data.js`

```javascript
#!/usr/bin/env node

/**
 * Sync test data to frontend repository
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  frontendPath: path.resolve(__dirname, '../mist-fe'),
  testResultsDir: path.resolve(__dirname, '../test-data/test-results/raw'),
  requiredFiles: [
    'shanghai-index-2024-2025-results.json',
    'csi300-2025-results.json',
    'shanghai-index-2024-results.json',
  ],
};

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

function checkFrontendExists() {
  log(colors.blue, '🔍 Checking frontend repository...');

  if (!fs.existsSync(CONFIG.frontendPath)) {
    log(colors.red, '❌ Frontend repository not found:', CONFIG.frontendPath);
    process.exit(1);
  }

  log(colors.green, '✅ Frontend repository found');
}

function validateTestResults() {
  log(colors.blue, '🔍 Validating test results...');

  const missingFiles = CONFIG.requiredFiles.filter(file => {
    const filePath = path.join(CONFIG.testResultsDir, file);
    return !fs.existsSync(filePath);
  });

  if (missingFiles.length > 0) {
    log(colors.yellow, '⚠️  Missing test result files:', missingFiles);
    log(colors.yellow, '💡 Hint: Run pnpm run test first');
    return false;
  }

  log(colors.green, '✅ Test results validated');
  return true;
}

function syncToFrontend() {
  log(colors.blue, '🚀 Syncing to frontend...');

  try {
    const cmd = `pnpm --dir ${CONFIG.frontendPath} run sync:from-backend`;
    execSync(cmd, {
      stdio: 'inherit',
      env: {
        ...process.env,
        BACKEND_PATH: path.resolve(__dirname, '..'),
      },
    });
    log(colors.green, '✅ Sync completed');
  } catch (error) {
    log(colors.red, '❌ Sync failed:', error.message);
    process.exit(1);
  }
}

function main() {
  log(colors.blue, '🎯 Syncing test data to frontend...\n');

  try {
    checkFrontendExists();
    validateTestResults();
    syncToFrontend();

    log(colors.green, '\n🎉 Sync complete!');
    log(colors.blue, '💡 In frontend: pnpm run dev');
  } catch (error) {
    log(colors.red, '\n❌ Sync failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
```

**Step 2: Make executable**

```bash
chmod +x scripts/sync-test-data.js
```

**Step 3: Test script**

```bash
node scripts/sync-test-data.js
```

Expected: Script runs (may fail if frontend not ready yet, that's ok)

**Step 4: Commit**

```bash
git add scripts/sync-test-data.js
git commit -m "feat(test-data): add main sync script for frontend

- Add sync-test-data.js to sync test results to mist-fe
- Validates frontend repository exists
- Checks test result files are present
- Invokes frontend sync script via pnpm
```

---

## Task 7: Create type definition generator script

**Files:**
- Create: `scripts/generate-type-definitions.js`

**Step 1: Create generator script**

Create: `scripts/generate-type-definitions.js`

```javascript
#!/usr/bin/env node

/**
 * Generate TypeScript type definitions from JSON test results
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.resolve(__dirname, '../test-data/test-results/raw');
const TYPES_DIR = path.resolve(__dirname, '../test-data/test-results/types');

// Ensure directory exists
if (!fs.existsSync(TYPES_DIR)) {
  fs.mkdirSync(TYPES_DIR, { recursive: true });
}

function toPascalCase(str) {
  return str.split(/[-]/g).map(part =>
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('');
}

function generateTypeDefinition(jsonFile) {
  const basename = path.basename(jsonFile, '.json');
  const tsPath = path.join(TYPES_DIR, `${basename}.ts`);
  const exportName = toPascalCase(basename);
  const varName = exportName.toLowerCase();
  const timestamp = new Date().toISOString();

  const content = `/**
 * ${exportName} Type Definitions
 *
 * Auto-generated from ${jsonFile}
 * Generated at: ${timestamp}
 */

// Type definitions matching backend VO structures
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

export interface IMergeK {
  startTime: Date | string;
  endTime: Date | string;
  highest: number;
  lowest: number;
  trend: string;
  mergedCount: number;
  mergedIds: number[];
  mergedData: IFetchK[];
}

export interface IFetchBi {
  startTime: Date | string;
  endTime: Date | string;
  highest: number;
  lowest: number;
  trend: string;
  type: string;
  status: number;
  independentCount: number;
  originIds: number[];
  originData: IFetchK[];
}

export interface IFetchChannel {
  zg: number;
  zd: number;
  gg: number;
  dd: number;
  level: string;
  type: string;
  startId: number;
  endId: number;
  trend: string;
  bis: any[];
}

// Main data interface
export interface I${exportName}Data {
  metadata: any;
  summary: any;
  data: {
    originalKLines: IFetchK[];
    mergeK: IMergeK[];
    bis: IFetchBi[];
    channels: IFetchChannel[];
  };
}

// Import JSON data
import rawData from './${jsonFile}';

// Type assertion
export const ${varName}: I${exportName}Data = rawData as unknown as I${exportName}Data;

// Convenience exports
export const ${varName}KLines = ${varName}.data.originalKLines;
export const ${varName}MergeK = ${varName}.data.mergeK;
export const ${varName}Bi = ${varName}.data.bis;
export const ${varName}Channels = ${varName}.data.channels;
export const ${varName}Summary = ${varName}.summary;
`;

  fs.writeFileSync(tsPath, content);
  console.log(`✅ Generated: ${basename}.ts`);
}

function main() {
  console.log('🔍 Scanning test results...\n');

  if (!fs.existsSync(RESULTS_DIR)) {
    console.log('⚠️  Test results directory not found');
    return;
  }

  const jsonFiles = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json'));

  if (jsonFiles.length === 0) {
    console.log('⚠️  No JSON files found');
    return;
  }

  console.log(`📝 Found ${jsonFiles.length} test result files\n`);

  jsonFiles.forEach(generateTypeDefinition);

  console.log(`\n✅ Complete! Types generated to: ${TYPES_DIR}`);
}

main();
```

**Step 2: Make executable**

```bash
chmod +x scripts/generate-type-definitions.js
```

**Step 3: Commit**

```bash
git add scripts/generate-type-definitions.js
git commit -m "feat(test-data): add TypeScript type definition generator

- Add generate-type-definitions.js script
- Generates .ts files from JSON test results
- Provides type-safe data access with backend VO compatibility
```

---

## Task 8: Update backend package.json scripts

**Files:**
- Modify: `package.json`

**Step 1: Update scripts section**

Open: `package.json`

Find scripts section and add/update:
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

**Step 2: Verify scripts**

```bash
cat package.json | grep -A 5 '"scripts"'
```

Expected: See the new scripts

**Step 3: Commit**

```bash
git add package.json
git commit -m "feat(test-data): add test data scripts to package.json

- Add test:sync to sync data to frontend
- Add test:gen-types to generate TypeScript definitions
- Add test:full to run tests and sync together
```

---

## Task 9: Create frontend test-data directory structure

**Files:**
- Create: `test-data/fixtures/k-line/.gitkeep`
- Create: `test-data/fixtures/patterns/.gitkeep`
- Create: `test-data/results/json/.gitkeep`
- Create: `test-data/results/types/.gitkeep`

**Step 1: Create directories**

```bash
cd /Users/xiyugao/code/mist/mist-fe
mkdir -p test-data/fixtures/k-line
mkdir -p test-data/fixtures/patterns
mkdir -p test-data/results/json
mkdir -p test-data/results/types
```

**Step 2: Create .gitkeep files**

```bash
touch test-data/fixtures/k-line/.gitkeep
touch test-data/fixtures/patterns/.gitkeep
touch test-data/results/json/.gitkeep
touch test-data/results/types/.gitkeep
```

**Step 3: Verify**

```bash
tree test-data/ -L 3
```

Expected: Directory tree created

**Step 4: Commit**

```bash
git add test-data/
git commit -m "feat(test-data): create unified test data directory in frontend

- Add fixtures/k-line for K-line data
- Add fixtures/patterns for pattern data
- Add results/json for synced JSON results
- Add results/types for TypeScript definitions
```

---

## Task 10: Move frontend K-line fixtures

**Files:**
- Move: `app/api/__tests__/fixtures/k-line-data/csi-300-2024-2025-simple.ts` → `test-data/fixtures/k-line/`
- Move: `app/api/__tests__/fixtures/k-line-data/csi-300-2023-real.ts` → `test-data/fixtures/k-line/`
- Move: `app/api/__tests__/fixtures/k-line-data/csi-300-2025-full-year.ts` → `test-data/fixtures/k-line/`
- Move: `app/api/__tests__/fixtures/k-line-data/csi-300-2025-real.ts` → `test-data/fixtures/k-line/`

**Step 1: Move all K-line fixtures**

```bash
mv app/api/__tests__/fixtures/k-line-data/csi-300-2024-2025-simple.ts \
   test-data/fixtures/k-line/

mv app/api/__tests__/fixtures/k-line-data/csi-300-2023-real.ts \
   test-data/fixtures/k-line/

mv app/api/__tests__/fixtures/k-line-data/csi-300-2025-full-year.ts \
   test-data/fixtures/k-line/

mv app/api/__tests__/fixtures/k-line-data/csi-300-2025-real.ts \
   test-data/fixtures/k-line/
```

**Step 2: Verify**

```bash
ls -la test-data/fixtures/k-line/
```

Expected: 4 fixture files

**Step 3: Commit**

```bash
git add test-data/fixtures/k-line/
git commit -m "refactor(test-data): move K-line fixtures to unified location

- Move csi-300-2024-2025-simple.ts
- Move csi-300-2023-real.ts
- Move csi-300-2025-full-year.ts
- Move csi-300-2025-real.ts
```

---

## Task 11: Create frontend unified export file

**Files:**
- Create: `test-data/index.ts`

**Step 1: Create unified exports**

Create: `test-data/index.ts`

```typescript
/**
 * Test Data Unified Export
 *
 * Centralized export point for all test data
 */

// K-line fixtures
export { mockKData, getMockKData } from './fixtures/k-line/csi-300-2024-2025-simple';
export {
  mockCSIData300Real,
  getRealCSIData,
  getCSIDataByDateRange,
} from './fixtures/k-line/csi-300-2023-real';
export {
  mockKData3002025,
  getMockKData3002025,
} from './fixtures/k-line/csi-300-2025-full-year';
export {
  mockCSI300Data2025Real,
} from './fixtures/k-line/csi-300-2025-real';

// Re-import for typing
import { mockKData as _mockKData } from './fixtures/k-line/csi-300-2024-2025-simple';
import { mockCSI300Data2025Real as _mockCSI300Data2025Real } from './fixtures/k-line/csi-300-2025-real';

type Dataset = "development" | "testing" | "production";

const MOCK_DATASETS: Record<Dataset, any> = {
  development: _mockCSI300Data2025Real,
  testing: _mockKData,
  production: [],
};

const getDataset = (): Dataset => {
  if (typeof process === "undefined") return "development";
  const env = process.env.NODE_ENV || "development";
  if (process.env.NEXT_PUBLIC_MOCK_DATASET) {
    return process.env.NEXT_PUBLIC_MOCK_DATASET as Dataset;
  }
  return env === "test" ? "testing" : "development";
};

/**
 * Get mock data based on environment
 */
export const getMockData = async (): Promise<any[]> => {
  const dataset = getDataset();
  return MOCK_DATASETS[dataset];
};
```

**Step 2: Verify no TypeScript errors**

```bash
pnpm run lint 2>&1 | grep -A 3 "test-data/index"
```

Expected: No errors (or fix any import issues)

**Step 3: Commit**

```bash
git add test-data/index.ts
git commit -m "feat(test-data): add unified export for test data

- Create index.ts with exports for all fixtures
- Add environment-based mock data selector
- Provide getMockData() helper function
```

---

## Task 12: Create frontend sync script

**Files:**
- Create: `scripts/sync-from-backend.js`

**Step 1: Create sync script**

Create: `scripts/sync-from-backend.js`

```javascript
#!/usr/bin/env node

/**
 * Sync test data from backend
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  backendPath: process.env.BACKEND_PATH || path.resolve(__dirname, '../../mist'),
  targetDir: path.resolve(__dirname, '../test-data/results/json'),
  typeTargetDir: path.resolve(__dirname, '../test-data/results/types'),
};

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

function checkBackend() {
  log(colors.blue, '🔍 Checking backend repository...');

  if (!fs.existsSync(CONFIG.backendPath)) {
    log(colors.red, '❌ Backend repository not found:', CONFIG.backendPath);
    process.exit(1);
  }

  const backendResultsDir = path.join(CONFIG.backendPath, 'test-data/test-results/raw');
  if (!fs.existsSync(backendResultsDir)) {
    log(colors.yellow, '⚠️  Backend test results not found');
    log(colors.yellow, '💡 Hint: Run pnpm run test in backend first');
    return false;
  }

  log(colors.green, '✅ Backend repository found');
  return true;
}

function syncJsonFiles() {
  log(colors.blue, '📦 Syncing JSON files...');

  const backendResultsDir = path.join(CONFIG.backendPath, 'test-data/test-results/raw');

  if (!fs.existsSync(CONFIG.targetDir)) {
    fs.mkdirSync(CONFIG.targetDir, { recursive: true });
  }

  let syncedCount = 0;

  const files = fs.readdirSync(backendResultsDir).filter(f => f.endsWith('.json'));

  files.forEach(file => {
    const sourcePath = path.join(backendResultsDir, file);
    const targetPath = path.join(CONFIG.targetDir, file);

    fs.copyFileSync(sourcePath, targetPath);
    log(colors.green, `  ✓ ${file}`);
    syncedCount++;
  });

  log(colors.green, `✅ Synced ${syncedCount} files`);
}

function syncTypeDefinitions() {
  log(colors.blue, '📝 Syncing type definitions...');

  const backendTypesDir = path.join(CONFIG.backendPath, 'test-data/test-results/types');

  if (!fs.existsSync(CONFIG.typeTargetDir)) {
    fs.mkdirSync(CONFIG.typeTargetDir, { recursive: true });
  }

  if (!fs.existsSync(backendTypesDir)) {
    log(colors.yellow, '⚠️  Backend types not found, skipping');
    return;
  }

  let syncedCount = 0;

  const files = fs.readdirSync(backendTypesDir).filter(f => f.endsWith('.ts'));

  files.forEach(file => {
    const sourcePath = path.join(backendTypesDir, file);
    const targetPath = path.join(CONFIG.typeTargetDir, file);

    fs.copyFileSync(sourcePath, targetPath);
    syncedCount++;
  });

  log(colors.green, `✅ Synced ${syncedCount} type files`);
}

function updateIndexFile() {
  log(colors.blue, '📝 Updating index file...');

  const files = fs.readdirSync(CONFIG.typeTargetDir)
    .filter(f => f.endsWith('.ts') && f !== 'index.ts');

  const exports = files.map(file => {
    const basename = path.basename(file, '.ts');
    return `export * from './${basename}';`;
  }).join('\n');

  const content = `/**
 * Test Results Type Definitions
 *
 * @last-updated ${new Date().toISOString()}
 */

${exports}
`;

  fs.writeFileSync(path.join(CONFIG.typeTargetDir, 'index.ts'), content);
  log(colors.green, '✅ Index file updated');
}

function main() {
  console.log(colors.blue, '🎯 Syncing test data from backend...\n');

  try {
    const backendExists = checkBackend();
    if (backendExists) {
      syncJsonFiles();
      syncTypeDefinitions();
      updateIndexFile();

      const jsonCount = fs.readdirSync(CONFIG.targetDir).length;
      log(colors.green, `\n🎉 Sync complete! ${jsonCount} result files`);
    }
  } catch (error) {
    log(colors.red, '\n❌ Sync failed:', error.message);
    process.exit(1);
  }
}

main();
```

**Step 2: Make executable**

```bash
chmod +x scripts/sync-from-backend.js
```

**Step 3: Commit**

```bash
git add scripts/sync-from-backend.js
git commit -m "feat(test-data): add sync script from backend

- Add sync-from-backend.js to sync test results
- Copies JSON files from mist/test-data/test-results/raw
- Copies TypeScript types from mist/test-data/test-results/types
- Updates index file with all available types
```

---

## Task 13: Update frontend package.json scripts

**Files:**
- Modify: `package.json`

**Step 1: Update scripts section**

Open: `package.json`

Update scripts:
```json
{
  "scripts": {
    "dev": "next dev",
    "dev:sync": "node scripts/sync-from-backend.js && next dev",
    "sync:from-backend": "node scripts/sync-from-backend.js",
    "lint": "eslint",
    "build": "next build"
  }
}
```

**Step 2: Verify scripts**

```bash
cat package.json | grep -A 5 '"scripts"'
```

Expected: See sync scripts added

**Step 3: Commit**

```bash
git add package.json
git commit -m "feat(test-data): add sync scripts to frontend package.json

- Add sync:from-backend to sync data from backend
- Add dev:sync to sync before starting dev server
```

---

## Task 14: Update fetch.ts import path

**Files:**
- Modify: `app/api/fetch.ts`

**Step 1: Update import**

Open: `app/api/fetch.ts`

Find:
```typescript
import { getMockData } from "./__tests__/fixtures";
```

Replace with:
```typescript
import { getMockData } from "@/test-data";
```

**Step 2: Verify**

```bash
grep "getMockData" app/api/fetch.ts
```

Expected: Import now uses @/test-data

**Step 3: Test build**

```bash
pnpm run build 2>&1 | head -50
```

Expected: Build succeeds (may have unrelated errors)

**Step 4: Commit**

```bash
git add app/api/fetch.ts
git commit -m "refactor(test-data): update import to use unified test data

- Change getMockData import from ./__tests__/fixtures to @/test-data
- Uses unified export from test-data/index.ts
```

---

## Task 15: Update k/page.tsx import paths

**Files:**
- Modify: `app/k/page.tsx`

**Step 1: Update imports**

Open: `app/k/page.tsx`

Find:
```typescript
import { shanghaiIndex2024_2025TestData } from "@/app/api/mock-data/shanghai-index-2024-2025-results";
import { TestStatisticsPanel } from "@/app/components/test-statistics-panel";
```

Replace with:
```typescript
import { shanghaiIndex2024_2025Results } from "@/test-data/results/types";
```

Remove TestStatisticsPanel import and usage (if exists)

**Step 2: Update data usage**

Find:
```typescript
k = shanghaiIndex2024_2025TestData.data.originalKLines;
statistics = shanghaiIndex2024_2025TestData.summary
```

Replace with:
```typescript
k = shanghaiIndex2024_2025Results.data.originalKLines;
statistics = shanghaiIndex2024_2025Results.summary
```

**Step 3: Verify**

```bash
grep "shanghaiIndex" app/k/page.tsx
```

Expected: Updated imports

**Step 4: Commit**

```bash
git add app/k/page.tsx
git commit -m "refactor(test-data): update page imports to use new test data structure

- Change import to use shanghaiIndex2024_2025Results
- Update data access to use new structure
- Remove TestStatisticsPanel (can be re-added later if needed)
```

---

## Task 16: Update tsconfig.json path aliases

**Files:**
- Modify: `tsconfig.json`

**Step 1: Add test-data paths**

Open: `tsconfig.json`

Find paths section and add:
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

**Step 2: Verify**

```bash
cat tsconfig.json | grep -A 7 "paths"
```

Expected: test-data paths configured

**Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "feat(test-data): add test-data path aliases to tsconfig.json

- Add @/test-data alias pointing to index.ts
- Add @/test-data/* wildcard alias
- Enables clean imports like: import { X } from '@/test-data'
```

---

## Task 17: Move and update test-data README

**Files:**
- Move: `app/api/__tests__/fixtures/README.md` → `test-data/README.md`
- Modify: `test-data/README.md`

**Step 1: Move README**

```bash
mv app/api/__tests__/fixtures/README.md test-data/README.md
```

**Step 2: Update README content**

Open: `test-data/README.md`

Update directory structure section to reflect new organization

**Step 3: Commit**

```bash
git add test-data/README.md
git commit -m "docs(test-data): move and update test data README

- Move README from app/api/__tests__/fixtures/ to test-data/
- Update directory structure documentation
- Add sync and usage instructions
```

---

## Task 18: Delete old fixture directories

**Files:**
- Delete: `app/api/__tests__/fixtures/`
- Delete: `app/api/mock-data/`

**Step 1: Verify old directories are safe to delete**

```bash
# Check if anything still imports from these locations
grep -r "__tests__/fixtures" app/ --include="*.ts" --include="*.tsx"
grep -r "mock-data" app/ --include="*.ts" --include="*.tsx"
```

Expected: No results (or update remaining files first)

**Step 2: Delete old directories**

```bash
rm -rf app/api/__tests__/fixtures
rm -rf app/api/mock-data
```

**Step 3: Verify**

```bash
ls -la app/api/ | grep -E "(fixtures|mock-data)"
```

Expected: Directories gone

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(test-data): remove old test data directories

- Delete app/api/__tests__/fixtures/ (moved to test-data/)
- Delete app/api/mock-data/ (moved to test-data/)
- Cleanup complete migration
```

---

## Task 19: Delete backend old fixture directory

**Files:**
- Delete: `apps/mist/src/chan/test/fixtures/`

**Step 1: Verify safe to delete**

```bash
cd /Users/xiyugao/code/mist/mist
grep -r "from './fixtures/" apps/mist/src/chan/test/
```

Expected: No results (all imports updated in Task 5)

**Step 2: Delete old directory**

```bash
rm -rf apps/mist/src/chan/test/fixtures
```

**Step 3: Verify**

```bash
ls apps/mist/src/chan/test/ | grep fixtures
```

Expected: No fixtures directory

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(test-data): remove old fixtures directory

- Delete apps/mist/src/chan/test/fixtures/
- All fixtures moved to test-data/fixtures/
- Migration complete
```

---

## Task 20: Run full sync test

**Files:**
- Test: Integration test

**Step 1: Generate test results in backend**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run test
```

Expected: Tests pass, results in test-data/test-results/raw/

**Step 2: Run sync script**

```bash
pnpm run test:sync
```

Expected: Sync completes successfully

**Step 3: Verify in frontend**

```bash
cd /Users/xiyugao/code/mist/mist-fe
ls test-data/results/json/
ls test-data/results/types/
```

Expected: Files synced from backend

**Step 4: Test frontend build**

```bash
pnpm run build 2>&1 | tail -30
```

Expected: Build succeeds

**Step 5: Final commit**

```bash
git add .
git commit -m "test(test-data): verify complete sync pipeline

- Backend generates test results
- Sync script successfully copies to frontend
- Frontend builds with synced data
- All systems operational
```

---

## Task 21: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md` (backend)
- Modify: `CLAUDE.md` (frontend)
- Modify: `/Users/xiyugao/code/mist/CLAUDE.md` (parent)

**Step 1: Update backend CLAUDE.md**

Open: `mist/CLAUDE.md`

Add section after Development Commands:

```markdown
## Test Data Management

### Directory Structure

\`\`\`
mist/test-data/
├── fixtures/           # Test input data
│   ├── k-line/         # K-line raw data
│   └── patterns/       # Test patterns
└── test-results/       # Test output
    ├── raw/            # JSON results
    └── types/          # TypeScript definitions
\`\`\`

### Synchronization

Sync test results to frontend:
\`\`\`bash
pnpm run test:sync     # Sync only
pnpm run test:full     # Run tests + sync
\`\`\`
```

**Step 2: Update frontend CLAUDE.md**

Open: `mist-fe/CLAUDE.md`

Update test data section to reflect new structure

**Step 3: Update parent CLAUDE.md**

Open: `/Users/xiyugao/code/mist/CLAUDE.md`

Add Test Data Management section (see design doc)

**Step 4: Commit all doc updates**

```bash
cd /Users/xiyugao/code/mist/mist
git add CLAUDE.md
git commit -m "docs(test-data): update CLAUDE.md with new test data structure

- Document test-data/ directory organization
- Add sync command documentation
- Explain fixture vs test-results separation
"
```

```bash
cd /Users/xiyugao/code/mist/mist-fe
git add CLAUDE.md
git commit -m "docs(test-data): update CLAUDE.md with test data sync info

- Document test-data/ directory structure
- Add sync-from-backend command
- Update import path examples
"
```

---

## Task 22: Create test data README

**Files:**
- Create: `test-data/README.md` in frontend

**Step 1: Create comprehensive README**

Create: `mist-fe/test-data/README.md`

```markdown
# Test Data

Frontend test data directory with fixtures and synced backend results.

## Directory Structure

\`\`\`
test-data/
├── fixtures/           # Static fixtures (local)
│   ├── k-line/         # K-line fixtures
│   └── patterns/       # Pattern fixtures
├── results/            # From backend sync
│   ├── json/          # Raw JSON results
│   └── types/         # TypeScript definitions
└── index.ts           # Unified export
\`\`\`

## Usage

\`\`\`typescript
// Import fixtures
import { getMockKData } from '@/test-data';

// Import synced results
import { shanghaiIndex2024_2025Results } from '@/test-data/results/types';
\`\`\`

## Syncing

\`\`\`bash
pnpm run sync:from-backend
\`\`\`
```

**Step 2: Commit**

```bash
git add test-data/README.md
git commit -m "docs(test-data): add comprehensive test data README

- Document directory structure
- Provide usage examples
- Explain sync process
```

---

## Success Criteria Verification

Run this final verification checklist:

```bash
# Backend verification
cd /Users/xiyugao/code/mist/mist
ls test-data/fixtures/k-line/        # Should have 3+ fixtures
ls test-data/test-results/raw/       # Should have test results
pnpm run test                        # Should pass
pnpm run test:sync                   # Should sync successfully

# Frontend verification
cd /Users/xiyugao/code/mist/mist-fe
ls test-data/fixtures/k-line/        # Should have 4+ fixtures
ls test-data/results/json/          # Should have synced JSON
ls test-data/results/types/         # Should have synced types
pnpm run build                       # Should succeed
pnpm run dev                         # Should run without errors
```

All checks should pass. If any fail, review relevant tasks and fix issues.
