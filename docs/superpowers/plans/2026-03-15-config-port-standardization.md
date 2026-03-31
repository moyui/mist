# Config & Port Standardization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize environment variable naming and add Joi validation for all backend applications' port configuration.

**Architecture:** Centralized Joi schemas in `libs/config` for validation, each app imports its schema in `app.module.ts`, all apps use unified `PORT` environment variable.

**Tech Stack:** NestJS ConfigModule, Joi validation, TypeScript

---

## Task 1: Add Joi Schemas for Each Application

**Files:**
- Modify: `libs/config/src/validation.schema.ts`

**Step 1: Read current validation schema**

Run: `cat libs/config/src/validation.schema.ts`

**Step 2: Add new schemas to validation.schema.ts**

Add after `sayaEnvSchema`:

```typescript
/**
 * Mist app-specific environment variable validation
 */
export const mistEnvSchema = commonEnvSchema.append({
  PORT: Joi.number().port().default(8001),
  redis_server_host: Joi.string().hostname().default('localhost'),
  redis_server_port: Joi.number().port().default(6379),
  redis_server_db: Joi.number().default(0),
});

/**
 * Chan app-specific environment variable validation
 */
export const chanEnvSchema = commonEnvSchema.append({
  PORT: Joi.number().port().default(8008),
});

/**
 * Schedule app-specific environment variable validation
 */
export const scheduleEnvSchema = commonEnvSchema.append({
  PORT: Joi.number().port().default(8003),
});
```

**Step 3: Verify TypeScript compiles**

Run: `cd libs/config && pnpm run build`

Expected: No errors

**Step 4: Commit**

```bash
git add libs/config/src/validation.schema.ts
git commit -m "feat(config): add Joi schemas for mist, chan, and schedule apps"
```

---

## Task 2: Update mist .env.example

**Files:**
- Modify: `apps/mist/src/.env.example`

**Step 1: Read current .env.example**

Run: `cat apps/mist/src/.env.example`

**Step 2: Replace entire file content**

```bash
# Server Configuration
PORT=8001

# Redis Configuration
redis_server_host=localhost
redis_server_port=6379
redis_server_db=1

# MySQL Configuration
mysql_server_host=localhost
mysql_server_port=3306
mysql_server_username=root
mysql_server_password=your_secure_password_here
mysql_server_database=mist

# Environment
NODE_ENV=development
```

**Step 3: Commit**

```bash
git add apps/mist/src/.env.example
git commit -m "chore(mist): update .env.example with PORT=8001"
```

---

## Task 3: Update saya .env.example

**Files:**
- Modify: `apps/saya/src/.env.example`

**Step 1: Read current .env.example**

Run: `cat apps/saya/src/.env.example`

**Step 2: Add PORT at the beginning**

After the first comment line, add:

```bash
# Server Configuration
PORT=8002
```

**Step 3: Commit**

```bash
git add apps/saya/src/.env.example
git commit -m "chore(saya): add PORT=8002 to .env.example"
```

---

## Task 4: Create chan .env.example

**Files:**
- Create: `apps/chan/src/.env.example`

**Step 1: Check if directory exists**

Run: `ls -la apps/chan/src/`

**Step 2: Create .env.example**

```bash
# Server Configuration
PORT=8008

# MySQL Configuration
mysql_server_host=localhost
mysql_server_port=3306
mysql_server_username=root
mysql_server_password=your_secure_password_here
mysql_server_database=mist

# Environment
NODE_ENV=development
```

**Step 3: Commit**

```bash
git add apps/chan/src/.env.example
git commit -m "chore(chan): add .env.example with PORT=8008"
```

---

## Task 5: Create schedule .env.example

**Files:**
- Create: `apps/schedule/src/.env.example`

**Step 1: Check if directory exists**

Run: `ls -la apps/schedule/src/`

**Step 2: Create .env.example**

```bash
# Server Configuration
PORT=8003

# MySQL Configuration
mysql_server_host=localhost
mysql_server_port=3306
mysql_server_username=root
mysql_server_password=your_secure_password_here
mysql_server_database=mist

# Environment
NODE_ENV=development
```

**Step 3: Commit**

```bash
git add apps/schedule/src/.env.example
git commit -m "chore(schedule): add .env.example with PORT=8003"
```

---

## Task 6: Update mcp-server .env.example

**Files:**
- Modify: `apps/mcp-server/.env.example`

**Step 1: Read current file**

Run: `cat apps/mcp-server/.env.example`

**Step 2: Replace MCP_SERVER_PORT with PORT**

Find `MCP_SERVER_PORT=8009` and replace with:

```bash
PORT=8009
```

Also update `MYSQL_SERVER_PORT` to `mysql_server_port` for consistency.

**Step 3: Verify changes**

Run: `cat apps/mcp-server/.env.example`

Expected: `PORT=8009` and `mysql_server_port=3306`

**Step 4: Commit**

```bash
git add apps/mcp-server/.env.example
git commit -m "chore(mcp-server): standardize PORT variable name"
```

---

## Task 7: Update saya main.ts

**Files:**
- Modify: `apps/saya/src/main.ts`

**Step 1: Read current main.ts**

Run: `cat apps/saya/src/main.ts`

**Step 2: Update port variable reference**

Find line with `process.env.port` and change to:

```typescript
await app.listen(process.env.PORT ?? 8002);
```

**Step 3: Verify TypeScript compiles**

Run: `cd apps/saya && pnpm run build`

Expected: No errors

**Step 4: Commit**

```bash
git add apps/saya/src/main.ts
git commit -m "fix(saya): use PORT environment variable (uppercase)"
```

---

## Task 8: Update schedule main.ts

**Files:**
- Modify: `apps/schedule/src/main.ts`

**Step 1: Read current main.ts**

Run: `cat apps/schedule/src/main.ts`

**Step 2: Update port variable reference**

Find line with `process.env.port` and change to:

```typescript
await app.listen(process.env.PORT ?? 8003);
```

**Step 3: Verify TypeScript compiles**

Run: `cd apps/schedule && pnpm run build`

Expected: No errors

**Step 4: Commit**

```bash
git add apps/schedule/src/main.ts
git commit -m "fix(schedule): use PORT environment variable (uppercase)"
```

---

## Task 9: Update mcp-server main.ts

**Files:**
- Modify: `apps/mcp-server/src/main.ts`

**Step 1: Read current main.ts**

Run: `cat apps/mcp-server/src/main.ts`

**Step 2: Update port variable reference**

Find line with `process.env.MCP_SERVER_PORT` and change to:

```typescript
const port = process.env.PORT ?? 8009;
```

**Step 3: Verify TypeScript compiles**

Run: `cd apps/mcp-server && pnpm run build`

Expected: No errors

**Step 4: Commit**

```bash
git add apps/mcp-server/src/main.ts
git commit -m "fix(mcp-server): use PORT environment variable"
```

---

## Task 10: Integrate Joi Schema in mist

**Files:**
- Modify: `apps/mist/src/app.module.ts`

**Step 1: Read current app.module.ts**

Run: `cat apps/mist/src/app.module.ts`

**Step 2: Add Joi schema import**

At the top of the file, add import:

```typescript
import { mistEnvSchema } from '@app/config';
```

**Step 3: Add validation to ConfigModule**

Find `ConfigModule.forRoot()` and add validation options:

```typescript
ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: mistEnvSchema,
  validationOptions: {
    allowUnknown: true,
    abortEarly: false,
  },
}),
```

**Step 4: Verify TypeScript compiles**

Run: `cd apps/mist && pnpm run build`

Expected: No errors

**Step 5: Commit**

```bash
git add apps/mist/src/app.module.ts
git commit -m "feat(mist): add Joi validation for environment variables"
```

---

## Task 11: Integrate Joi Schema in saya

**Files:**
- Modify: `apps/saya/src/saya.module.ts`

**Step 1: Read current module file**

Run: `cat apps/saya/src/saya.module.ts`

**Step 2: Add Joi schema import**

At the top of the file, add import:

```typescript
import { sayaEnvSchema } from '@app/config';
```

**Step 3: Add ConfigModule with validation**

If `ConfigModule` is already imported, add validation options. Otherwise, add:

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: sayaEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    // ... other imports
  ],
  // ...
})
```

**Step 4: Verify TypeScript compiles**

Run: `cd apps/saya && pnpm run build`

Expected: No errors

**Step 5: Commit**

```bash
git add apps/saya/src/saya.module.ts
git commit -m "feat(saya): add Joi validation for environment variables"
```

---

## Task 12: Integrate Joi Schema in chan

**Files:**
- Modify: `apps/chan/src/chan-app.module.ts`

**Step 1: Read current module file**

Run: `cat apps/chan/src/chan-app.module.ts`

**Step 2: Add Joi schema import**

At the top of the file, add import:

```typescript
import { chanEnvSchema } from '@app/config';
```

**Step 3: Add ConfigModule with validation**

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: chanEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    // ... other imports
  ],
  // ...
})
```

**Step 4: Verify TypeScript compiles**

Run: `cd apps/chan && pnpm run build`

Expected: No errors

**Step 5: Commit**

```bash
git add apps/chan/src/chan-app.module.ts
git commit -m "feat(chan): add Joi validation for environment variables"
```

---

## Task 13: Integrate Joi Schema in schedule

**Files:**
- Modify: `apps/schedule/src/app.module.ts` or similar

**Step 1: Find the module file**

Run: `ls apps/schedule/src/*.module.ts`

**Step 2: Read the module file**

Run: `cat apps/schedule/src/<module-file>.ts`

**Step 3: Add Joi schema import**

At the top of the file, add import:

```typescript
import { scheduleEnvSchema } from '@app/config';
```

**Step 4: Add ConfigModule with validation**

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: scheduleEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    // ... other imports
  ],
  // ...
})
```

**Step 5: Verify TypeScript compiles**

Run: `cd apps/schedule && pnpm run build`

Expected: No errors

**Step 6: Commit**

```bash
git add apps/schedule/src/<module-file>.ts
git commit -m "feat(schedule): add Joi validation for environment variables"
```

---

## Task 14: Update mcp-server if Needed

**Files:**
- Check: `apps/mcp-server/src/**/*.ts`

**Step 1: Check if mcp-server uses NestJS ConfigModule**

Run: `grep -r "ConfigModule" apps/mcp-server/src/`

**Step 2: If ConfigModule is used, add validation**

Follow pattern from Task 10-13.

**Step 3: If not using ConfigModule, skip this task**

mcp-server may not use NestJS ConfigModule pattern.

**Step 4: If changes made, commit**

```bash
git add apps/mcp-server/src/<modified-files>
git commit -m "feat(mcp-server): add Joi validation if applicable"
```

---

## Task 15: Test All Applications Start Successfully

**Step 1: Build all projects**

Run: `pnpm run build`

Expected: No errors

**Step 2: Test mist app**

Run: `cd apps/mist && pnpm run start:dev`

Expected: App starts on port 8001, no Joi validation errors

**Step 3: Test saya app**

Run: `cd apps/saya && pnpm run start:dev`

Expected: App starts on port 8002, no Joi validation errors

**Step 4: Test chan app**

Run: `cd apps/chan && pnpm run start:dev`

Expected: App starts on port 8008, no Joi validation errors

**Step 5: Test schedule app**

Run: `cd apps/schedule && pnpm run start:dev`

Expected: App starts on port 8003, no Joi validation errors

**Step 6: Test mcp-server**

Run: `cd apps/mcp-server && pnpm run start:dev`

Expected: App starts on port 8009

**Step 7: Commit working state**

```bash
git add -A
git commit -m "chore: all apps start successfully with new config"
```

---

## Task 16: Update Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md with new PORT info**

Find the Applications table and ensure it notes that all apps use `PORT` environment variable.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with standardized PORT configuration"
```

---

## Testing Strategy

1. **Build verification:** Each app builds without errors
2. **Startup verification:** Each app starts with correct default port
3. **Environment override:** Test setting PORT in .env overrides default
4. **Validation errors:** Test invalid PORT value (e.g., "abc") causes startup error

## Rollback Plan

If any app fails to start:
1. Revert the specific commit: `git revert <commit-hash>`
2. Check .env file has correct values
3. Verify Joi schema syntax is correct
4. Check ConfigModule import is correct

## Notes

- `libs/constants/` is intentionally unchanged - maintains simple object style
- Backward compatible: `main.ts` fallback ensures apps start even if .env not updated
- All apps use `isGlobal: true` for ConfigModule to make config available everywhere
