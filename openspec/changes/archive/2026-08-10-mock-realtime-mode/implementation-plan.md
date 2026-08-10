# mock-realtime-mode — 实施计划（代码级细化）

> 三步工作流第 2 步。spec 已逐条确认通过；本计划细化到代码层面（每个文件的
> 改动点、代码形态、import 变化、测试用例逐条、验证命令）。确认通过后进入第 3 步落地。

---

## 0. 前置事实（已实测/已读源码确认）

| 事实 | 结论 |
|---|---|
| Joi `.append()` 可覆盖同 key | 实测通过：mist 层覆盖 common 层的 `mysql_server_host` 生效 |
| Joi `.when('MIST_MOCK_MODE', {is:'true', then:optional, otherwise:required})` | 实测通过：mock 免 mysql 通过 / 生产缺 mysql 失败 / 生产有 mysql 通过 |
| 其他 app（chan/schedule/signal/backtest 继承 `commonEnvSchema`）| 不受影响（common 层不动，只在 mist 层 append 覆盖）|
| `@Module` 装饰器在 import 时静态求值 | mock 启动测试须在 require AppModule 前设 `MIST_MOCK_MODE=true` |
| jest `setupFiles: apps/test/jest-env.ts` | 预置 `mysql_server_*`，但与 mock 无关——`.when()` 只看 `MIST_MOCK_MODE`，TypeORM 在 mock 下不初始化 |
| `RealtimeIngressModule` 是 @Global | 内存 repo 的 provider 覆盖必须落在该模块内部（AppModule 层覆盖不了）|
| `RealtimeSecurityAllowlistService` 只在 allowlist env 非空 + lifecycle=off 时查库 | mock 保持 allowlist 空 → 假 repo 永不调用 |

---

## Step A：`libs/config/src/validation.schema.ts`

### A1. 改动位置

`mistEnvSchema` 的 `.append({...})` 块内、`PORT` 定义之后（现第 45-46 行之间）插入覆盖。**`commonEnvSchema` 不动**。

### A2. 新增代码（插入 append 块内）

```ts
export const mistEnvSchema = commonEnvSchema
  .append({
    PORT: Joi.number().port().default(8001),
    // Mock mode (MIST_MOCK_MODE=true) starts without MySQL: the mysql_server_*
    // variables become optional. Production (unset/false) keeps them required.
    MIST_MOCK_MODE: Joi.valid('true', 'false')
      .default('false')
      .description(
        'true=start backend without MySQL (mock mode); unset/false=production behavior',
      ),
    mysql_server_host: Joi.string()
      .hostname()
      .when('MIST_MOCK_MODE', {
        is: 'true',
        then: Joi.optional(),
        otherwise: Joi.required(),
      }),
    mysql_server_username: Joi.string().when('MIST_MOCK_MODE', {
      is: 'true',
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
    mysql_server_password: Joi.string().when('MIST_MOCK_MODE', {
      is: 'true',
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
    mysql_server_database: Joi.string().when('MIST_MOCK_MODE', {
      is: 'true',
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
    // ... 现有 redis_server_* / DEFAULT_DATA_SOURCE / TDX_* / QMT_* / REALTIME_* 全部不变
  })
```

### A3. 追加 isMockMode()（env 判断集中到 libs/config，不耦合业务代码）

**位置**：`validation.schema.ts` 文件底部、`resolveRealtimeStrategyMode` 旁边（第 304 行区域）——它是同类的"env 读取纯函数"先例（`resolveRealtimeStrategyMode` 正是从 libs/config 导出、被 realtime-ingress.module.ts import 的）。

```ts
/** Mock mode reads the same env the schema validates; single source of truth. */
export function isMockMode(): boolean {
  return process.env.MIST_MOCK_MODE === 'true';
}
```

**为什么放这里**（用户拍板：env 判断不耦合业务代码）：
- `app.module.ts` 已 import `@app/config`（mistEnvSchema，第 29 行）、`realtime-ingress.module.ts` 已 import `@app/config`（resolveRealtimeStrategyMode，第 14 行）——**两模块依赖 @app/config 已存在，抽共享零新增依赖方向**（此前计划"不抽共享"的理由经核实不成立）。
- 与 `resolveRealtimeStrategyMode` 并列：同是"读 env → 返回模式"的纯函数，无业务逻辑。
- 两个消费模块从 `@app/config` import `isMockMode`，**不再各定义一份**（消除重复）。

### A4. 明确不做

- ❌ 不新增 `mistMockEnvSchema`（单一 schema 原则）
- ❌ 不改 `commonEnvSchema`（其他 app 零影响）
- ❌ 不改 `mysql_server_port`（已有 `.default(3306)` 本就 optional）
- ❌ 不在 app.module / realtime-ingress.module 内定义 `isMockMode`（统一从 @app/config import）

---

## Step B：`apps/mist/src/app.module.ts`

### B1. import 变化

第 16 行 `import { Module } from '@nestjs/common';` →
```ts
import { DynamicModule, Module, Type } from '@nestjs/common';
```

第 29 行 `import { mistEnvSchema } from '@app/config';` →
```ts
import { isMockMode, mistEnvSchema } from '@app/config';
```

### B2. imports 数组变化（第 59-103 行）

删除 `TypeOrmModule.forRootAsync({...})`（第 59-94 行整块）+ `HistoricalCollectorModule`（95 行）+
`RealtimeSubscriptionModule`（97 行）+ `IndicatorModule`（100 行）+ `SecurityModule`（101 行）+
`ChanModule`（102 行）+ `StrategyModule`（103 行），替换为：

```ts
    ...mockModeModulesForMode(isMockMode()),
    RealtimeIngressModule,
    ...tdxRealtimeModulesForMode(process.env.TDX_REALTIME_MODE),
    ...qmtRealtimeModulesForMode(process.env.QMT_REALTIME_MODE),
```

即最终 imports 数组：

```ts
  imports: [
    HttpTransportModule,
    ConfigModule.forRoot({ /* 原样不动 */ }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ...mockModeModulesForMode(isMockMode()),
    RealtimeIngressModule,
    ...tdxRealtimeModulesForMode(process.env.TDX_REALTIME_MODE),
    ...qmtRealtimeModulesForMode(process.env.QMT_REALTIME_MODE),
  ],
```

### B3. 文件底部新增一个导出函数（第 136 行后）

```ts
/**
 * Modules that require MySQL. Mock mode (MIST_MOCK_MODE=true) omits all of
 * them; production keeps them. Single source of truth: adding a business
 * module here automatically excludes it from mock mode.
 *
 * Order-sensitive: the TypeORM forRootAsync dynamic module MUST stay first —
 * Nest initializes dependencies in array order, and the business modules'
 * forFeature repositories resolve against the root DataSource.
 */
export function mockModeModulesForMode(
  isMock: boolean,
): Array<Type<unknown> | DynamicModule> {
  return isMock
    ? []
    : [
        TypeOrmModule.forRootAsync({
          useFactory(configService: ConfigService) {
            return {
              type: 'mysql',
              host: configService.get('mysql_server_host'),
              port: configService.get('mysql_server_port'),
              username: configService.get('mysql_server_username'),
              password: configService.get('mysql_server_password'),
              database: configService.get('mysql_server_database'),
              timezone: '+08:00',
              synchronize: false,
              logging: configService.get('NODE_ENV') !== 'production',
              entities: [
                K, KExtensionEf, KExtensionTdx, KExtensionQmt,
                Security, SecuritySourceConfig, RealtimeSubscriptionAssignment,
                StrategyDefinition, StrategyVersion, StrategySignal,
                StrategyAlertEvent, BacktestRun, BacktestSignalResult,
              ],
              poolSize: 10,
              connectorPackage: 'mysql2',
              extra: { authPlugins: 'sha256_password' },
            };
          },
          inject: [ConfigService],
        }),
        HistoricalCollectorModule,
        RealtimeSubscriptionModule,
        IndicatorModule,
        SecurityModule,
        ChanModule,
        StrategyModule,
      ];
}
```

> `isMockMode()` **不在此文件定义**——从 `@app/config` import（Step A3），env 判断集中一处。

### B4. main.ts：零改动（确认即可，不加分支）

---

## Step C：`apps/mist/src/realtime/realtime-ingress.module.ts`

### C1. import 变化

第 2 行 `import { TypeOrmModule } from '@nestjs/typeorm';` →
```ts
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
```
新增：`import type { Repository } from 'typeorm';`（放在 shared-data import 后）

第 14 行 `import { resolveRealtimeStrategyMode } from '@app/config';` →
```ts
import { isMockMode, resolveRealtimeStrategyMode } from '@app/config';
```

### C2. imports 数组变化（第 22 行）

`TypeOrmModule.forFeature([SecuritySourceConfig]),` →
```ts
    ...realtimePersistenceModulesForMode(isMockMode()),
```

### C3. providers 数组变化（第 28-40 行）

在数组末尾（`RealtimeStrategyHandoffObservabilityService,` 后）追加：

```ts
    ...(isMockMode()
      ? [
          {
            provide: getRepositoryToken(SecuritySourceConfig),
            useValue: mockSourceConfigRepository,
          },
        ]
      : []),
```

### C4. 文件底部新增（第 55 行后）

```ts
/**
 * Mock-mode in-memory SecuritySourceConfig repository. The allowlist service
 * only queries the DB when a non-empty allowlist is configured with
 * lifecycle=off (realtime-security-allowlist.service.ts:44-80); mock mode
 * keeps allowlists empty so this is never invoked. Any unexpected query
 * fails fast rather than silently returning an empty result.
 */
const mockSourceConfigRepository = {
  createQueryBuilder: () => {
    throw new Error(
      'mock mode: allowlist database resolution is unavailable; keep TDX/QMT_REALTIME_ALLOWLIST empty',
    );
  },
} as unknown as Repository<SecuritySourceConfig>;

/** Modules that require the SecuritySourceConfig repository. */
export function realtimePersistenceModulesForMode(isMock: boolean) {
  return isMock ? [] : [TypeOrmModule.forFeature([SecuritySourceConfig])];
}

export function isMockMode(): boolean {
  return process.env.MIST_MOCK_MODE === 'true';
}
```

### C5. 说明

- `isMockMode()` **不在此文件定义**——从 `@app/config` import（Step A3），env 判断集中一处，
  与 `resolveRealtimeStrategyMode` 同源同模式（用户拍板：env 判断不耦合业务代码）。
- `mockSourceConfigRepository` 是模块级 const，非 provider——生产模式不引用（`isMockMode()` 为 false
  时 providers 数组不含它），无副作用。

---

## Step D：单测

### D1. `libs/config/src/validation.schema.spec.ts`

**import 变化**：第 1 行 `import { backtestEnvSchema, mistEnvSchema } from './validation.schema';` 不变（不新增 schema，不需要新 import）。

**文件末尾追加 describe**：

```ts
describe('mistEnvSchema mock mode', () => {
  it('accepts MIST_MOCK_MODE=true without any mysql_server_* variables', () => {
    const { error, value } = mistEnvSchema.validate({ MIST_MOCK_MODE: 'true' });
    expect(error).toBeUndefined();
    expect(value.MIST_MOCK_MODE).toBe('true');
  });

  it('accepts mock mode with mysql variables also present', () => {
    const { error } = mistEnvSchema.validate({
      ...baseEnv,
      MIST_MOCK_MODE: 'true',
    });
    expect(error).toBeUndefined();
  });

  it('defaults MIST_MOCK_MODE to false when unset', () => {
    const { error, value } = mistEnvSchema.validate(baseEnv);
    expect(error).toBeUndefined();
    expect(value.MIST_MOCK_MODE).toBe('false');
  });

  it('still requires mysql_server_* in production (MIST_MOCK_MODE unset)', () => {
    const { error } = mistEnvSchema.validate({});
    expect(error?.message).toContain('mysql_server_host');
  });

  it('rejects a non-boolean MIST_MOCK_MODE value', () => {
    const { error } = mistEnvSchema.validate({
      ...baseEnv,
      MIST_MOCK_MODE: 'yes',
    });
    expect(error?.message).toContain('MIST_MOCK_MODE');
  });

  it('keeps queue-limit relationship check in mock mode', () => {
    const { error } = mistEnvSchema.validate({
      MIST_MOCK_MODE: 'true',
      REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES: 32,
      REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL: 16,
    });
    expect(error?.message).toContain(
      'REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL must be greater than or equal to REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES',
    );
  });

  it('keeps lifecycle-on/allowlist conflict check in mock mode', () => {
    const { error } = mistEnvSchema.validate({
      MIST_MOCK_MODE: 'true',
      REALTIME_SUBSCRIPTION_LIFECYCLE_MODE: 'on',
      TDX_REALTIME_ALLOWLIST: '600030.SH',
    });
    expect(error?.message).toContain('REALTIME_SUBSCRIPTION_LIFECYCLE_MODE=on');
  });
});
```

### D2. `apps/mist/src/app.module.spec.ts`

**import 变化**：

```ts
import {
  mockModeModulesForMode,
  qmtRealtimeModulesForMode,
  tdxRealtimeModulesForMode,
} from './app.module';
import { isMockMode } from '@app/config';   // isMockMode 在 libs/config，从 @app/config import
```

**文件末尾追加**：

```ts
describe('mock mode module matrix', () => {
  it('omits TypeORM and all business modules in mock mode', () => {
    expect(mockModeModulesForMode(true)).toEqual([]);
  });

  it('keeps TypeORM root + 6 business modules in production mode', () => {
    const modules = mockModeModulesForMode(false);
    expect(modules).toHaveLength(7);
    // First entry is the TypeORM forRootAsync dynamic module (object with
    // a module class); the rest are business module classes (functions).
    expect(typeof modules[0]).toBe('object');
    for (const module of modules.slice(1)) {
      expect(typeof module).toBe('function');
    }
  });

  it('reads mock mode from the MIST_MOCK_MODE env', () => {
    const before = isMockMode();
    process.env.MIST_MOCK_MODE = 'true';
    expect(isMockMode()).toBe(true);
    process.env.MIST_MOCK_MODE = 'false';
    expect(isMockMode()).toBe(false);
    delete process.env.MIST_MOCK_MODE;
    expect(isMockMode()).toBe(before); // restore original
  });
});
```

### D3. AppModule mock-mode 启动测试（关键，单独 describe）

> 注意：**没有 MockAppModule**（单一 AppModule 方案）——本测试验证的是同一个 AppModule
> 在 `MIST_MOCK_MODE=true` 时以 mock 模块集启动（TypeORM + 业务模块被跳过、无 mysql 连接）。

**关键机制**：`@Module` 装饰器在模块被 import 时静态求值 `isMockMode()`。app.module.spec.ts
顶部已 `import { ... } from './app.module'` —— 该 import 在**测试文件加载时**执行，此时
`MIST_MOCK_MODE` 未设 → `mockModeModulesForMode(false)` 被求值一次并缓存。所以不能复用
顶部 import 的 AppModule 做 mock 启动测试，必须 `jest.resetModules()` + 动态 require。

**已实测确认的安全前提**（自查验证，落地无需再验）：
- TDX/QMT realtime client `connect()` 失败是**静默的**（`ws.on('error')` 只记录 store error、
  `on('close')` 定时重连，**不 throw**）——mock 无 datasource 时 `NestFactory.create` 不会失败。
- `RealtimeStrategyStartupCompensationService` / `RealtimeStrategyHandoffObservabilityService`
  无 TypeORM 依赖（前者依赖 redis+allowlist+clock + 两个 @Optional，后者无构造依赖）。
- `RealtimeSubscriptionModule` 被跳过无连带影响（仅 app.module 引用它）。
- allowlist `initialize()` 在 `REALTIME_SUBSCRIPTION_LIFECYCLE_MODE=on` 时短路不查库
  （realtime-security-allowlist.service.ts:44-51）。

**文件末尾追加**（jest 的 `require` 在 ts-jest 下可用，配合 `jest.resetModules()`）：

```ts
import { NestFactory } from '@nestjs/core';   // 放文件顶部 import 区

describe('AppModule mock-mode bootstrap', () => {
  const originalMockMode = process.env.MIST_MOCK_MODE;
  const originalLifecycle = process.env.REALTIME_SUBSCRIPTION_LIFECYCLE_MODE;

  afterEach(() => {
    if (originalMockMode === undefined) {
      delete process.env.MIST_MOCK_MODE;
    } else {
      process.env.MIST_MOCK_MODE = originalMockMode;
    }
    if (originalLifecycle === undefined) {
      delete process.env.REALTIME_SUBSCRIPTION_LIFECYCLE_MODE;
    } else {
      process.env.REALTIME_SUBSCRIPTION_LIFECYCLE_MODE = originalLifecycle;
    }
  });

  it('starts without MySQL when MIST_MOCK_MODE=true', async () => {
    process.env.MIST_MOCK_MODE = 'true';
    // Align with .env.mock: lifecycle=on short-circuits allowlist DB lookup.
    process.env.REALTIME_SUBSCRIPTION_LIFECYCLE_MODE = 'on';
    jest.resetModules(); // force re-evaluation of @Module decorators
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AppModule } = require('./app.module');

    const app = await NestFactory.create(AppModule, { logger: false });
    try {
      const http = app.getHttpAdapter().getInstance();
      const server = http.listen(0);
      await new Promise<void>((resolve) => {
        server.once('listening', () => resolve());
      });
      const addr = server.address() as { port: number };
      expect(addr.port).toBeGreaterThan(0);
    } finally {
      await app.close();
      // TDX/QMT WS clients schedule reconnect timers on close; app.close()
      // destroys modules and clears them via shuttingDown. If a jest
      // "worker failed to exit gracefully" warning appears, add a short
      // delay before resolve — 落地时若遇此问题回到这里处理，不自行绕过。
    }
  }, 30_000);
});
```

**注意**：
- `jest.resetModules()` 会清空所有模块缓存，但 `@nestjs/core` 等依赖的 require 缓存也会清——
  第二次 require 会重新加载全部依赖（慢，但单测可接受，30s timeout 覆盖）。
- 若 `jest.resetModules()` 导致 Nest 内部单例问题（如 Reflect metadata 重复注册），备选：
  改用**独立 spec 文件** `apps/mist/src/app.module.mock.spec.ts`（jest testRegex `.*\.spec\.ts$`
  会匹配），在该文件顶部 require 前设 env：
  ```ts
  process.env.MIST_MOCK_MODE = 'true';
  import { AppModule } from './app.module';  // 注意：import 提升，须用 require
  ```
  实际落地时先试 D3 方案（同文件 + resetModules）；若失败改独立文件方案。**两种都写进计划，
  落地时选可行的**。

---

## Step E：校验（按序执行）

```bash
cd /Users/moyui/sean/mist/mist/.worktrees/mock-realtime-mode   # 落地时在 worktree 内

# 1. typecheck
pnpm typecheck
# 预期：exit 0

# 2. 相关单测（先跑改动相关的，快）
pnpm test -- libs/config/src/validation.schema.spec.ts apps/mist/src/app.module.spec.ts
# 预期：2 suites 全绿（原 37 + 新增 ~15 用例 + mock 启动）

# 3. 全量（确认无回归；已知跳过项忽略）
pnpm test
# 预期：149 suites / 1226+ passed（跳过 2 个已知）；chan openapi spec 预存失败忽略（AGENTS.md §七）

# 4. openspec
export PATH="/Users/moyui/Library/pnpm/bin:$PATH"
openspec validate mock-realtime-mode --strict
openspec validate --all --strict
# 预期：change valid；68 specs 全过

# 5. whitespace
git diff --check
# 预期：无输出
```

---

## Step F：合并流程

```bash
# worktree 已在（落地时建）
/usr/local/bin/git -C <worktree> add -A
/usr/local/bin/git -C <worktree> commit -m "feat(mock): mysql-free mock mode via MIST_MOCK_MODE (single AppModule + Joi .when())"
/usr/local/bin/git -C <worktree> push -u origin feat/mock-realtime-mode
# 主 worktree 合并
/usr/local/bin/git -C /Users/moyui/sean/mist/mist merge --no-ff feat/mock-realtime-mode -m "merge: mock-realtime-mode"
/usr/local/bin/git -C /Users/moyui/sean/mist/mist push origin master
# 清理
/usr/local/bin/git -C /Users/moyui/sean/mist/mist push origin --delete feat/mock-realtime-mode
/usr/local/bin/git -C /Users/moyui/sean/mist/mist worktree remove <worktree>
/usr/local/bin/git -C /Users/moyui/sean/mist/mist branch -D feat/mock-realtime-mode
# 注意：删 worktree 前确认 Bash cwd 不在 worktree 内（记忆 bash-cwd-deleted-dir-spawn-enoent）
```

---

## Step G：Phase 2 mock 环境（实施计划确认后、spec 确认后再动）

> 已更新为 **v4 落位（2026-08-07 用户拍板）**：工具集整体放 **mist-datasource 仓
> `tools/mock-env/`**，全本机形态（三仓本机进程 + redis 单容器），无 compose、无镜像 build、
> mist/package.json 不加 mock scripts。详细代码级计划见 `implementation-plan-phase2.md`（v4）。

（v2 旧落位已废弃：`tools/` + `test/fixtures/mock/` + `deploy/docker/docker-compose.mock.yml` +
npm scripts 方案不再使用。）

---

## 风险清单（落地时逐一确认）

| 风险 | 应对 |
|---|---|
| mock 启动测试暴露未预见依赖（某模块 import 链隐式需 DB）| **停止，回 spec 讨论**，不自行绕过 |
| `jest.resetModules()` 导致 Nest 单例问题 | 改用独立 spec 文件方案（D3 已备选）|
| TypeORM 配置搬入函数后行为变化 | 原样搬（entities/poolSize/connectorPackage 全保留），`mockModeModulesForMode(false)` 与现状等价的验证靠 app.module.spec 的"7 个模块"断言 |
| 覆盖率阈值（lines 82.72）| 新增代码行被新增单测覆盖；若 mock 分支拉低覆盖率，评估补用例（如 isMockMode 三态）|

---

## Step H：mock 模式订阅驱动（2026-08-08 用户拍板：lifecycle=off + env allowlist 内存解析）

> **背景（代码实证）**：mock 模式跳过 RealtimeSubscriptionModule → coordinator（生产唯一
> sync 调用者）不加载 → 无论 lifecycle on/off，backend 都不发 sync_subscriptions →
> datasource 广播只推给订阅者 → backend 收不到帧，candle 链路在入口断。
> **方向（用户拍板）**：订阅不模拟（终端/收敛/desired 管理都是真机行为）；mock 只注入
> 上游数据。订阅走真实机制：allowlist env 内存解析（不查库）+ backend 真实 sync。
> spec 场景「Mock mode drives real subscriptions from the env allowlist」已扩展。

### H1 `apps/mist/src/realtime/realtime-security-allowlist.service.ts`

`initialize()` 顶部（`assignedEntries.has` 检查之后、lifecycle 短路之前）加 mock 分支：

```ts
if (isMockMode()) {
  // Mock mode has no coordinator module and no database; the env allowlist is
  // the sole subscription source and resolves from memory with a stable
  // placeholder securityId (never a DB lookup). REALTIME_SUBSCRIPTION_LIFECYCLE_MODE
  // is ignored: the coordinator (the on-mode authority) is not loaded.
  const resolved = new Map<string, RealtimeAllowlistEntry>();
  for (const formatCode of this.parse(environmentName)) {
    resolved.set(formatCode, { formatCode, securityId: 1 });
  }
  this.assignedEntries.set(source, resolved);
  this.effectiveEntries.set(source, new Map(resolved));
  return;
}
```

- `isMockMode` 从 `@app/config` import（与 app.module 同源）
- `parse()` 复用（去重/上限 5 的校验保留）
- `securityId: 1` 稳定占位：mock 分支不查库、不做 TDX/QMT 冲突检查；下游
  `replaceAssigned/replaceEffective` 只按同 securityId 过滤，同源无影响

### H2 `apps/mist/src/sources/tdx/realtime/realtime.client.ts` + qmt 同款

`handleReady()` 末尾加 mock 分支（TDX 与 QMT 各一份，内容相同）：

```ts
if (isMockMode()) {
  // No coordinator module in mock mode; drive real subscriptions directly
  // from the env allowlist once the transport is ready.
  void this.syncSubscriptions(
    this.allowlist.entriesList.map((entry) => entry.formatCode),
  );
}
```

- `syncSubscriptions(symbols)` 是 client 已实现的真实控制面方法（发帧 + 等 ack + 超时）
- `entriesList` getter 在 resolver 已有（`shared.list()` → effectiveEntries，mock 分支里
  与 assigned 同源）
- 重连 → 每次 ready 都 sync：幂等，与生产 coordinator 的 accepted_ready reset 同语义

### H3 `mist-datasource/tools/mock-env/.env.mock`

```
REALTIME_SUBSCRIPTION_LIFECYCLE_MODE=off
TDX_REALTIME_ALLOWLIST=600519.SH
QMT_REALTIME_ALLOWLIST=300502.SZ
```

- lifecycle=off：与 env allowlist 共存合法（Joi 冲突校验只禁 on+非空）
- 生产 mock 语义：订阅完全由 env 静态声明，coordinator 的 ACTIVE 权威不参与

### H4 `mist-datasource/tools/mock-env/mock-drive.py`

- 删除 `ws_sync_subscriptions()` + `threading` import + TDX/QMT 的调用
  （订阅由 backend 真实 sync 驱动，注入器不再碰控制面）
- 保留 bridge owner→poll→result→snapshot（datasource 收帧的必经协议，
  是「推数据」通道，不是模拟订阅）；`tdx_converge` 的 desired>=1 循环保留
  （等 backend sync 落地后 desired 非空再收敛）

### H5 单测

| 文件 | 用例 |
|---|---|
| `validation.schema.spec.ts` | lifecycle=off + TDX/QMT allowlist 非空通过（Joi 合法组合）|
| allowlist service spec（新增或并入现有）| mock 分支：env 非空 → 内存条目（securityId=1，无 DB）；env 空 → 空 map |
| tdx/qmt client spec | mock 模式 ready 后调用 syncSubscriptions(env 符号)；非 mock 不调 |

### H6 校验

`pnpm test` / `pnpm typecheck` / `openspec validate --all --strict` 全绿。

### 风险

| 风险 | 应对 |
|---|---|
| securityId=1 占位被下游当真 | mock 分支注释明示；mock 链路（聚合/封存）只用 formatCode，不触 securityId 语义 |
| client ready 后 sync 与注入器收敛竞争 | 注入器 poll 循环等待 desired>=1（已实现）；sync 幂等 |
| mock 分支覆盖拉低覆盖率阈值 | 新增单测覆盖 mock 分支行 |
