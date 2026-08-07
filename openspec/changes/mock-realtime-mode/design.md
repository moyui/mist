## Context

macOS 本地 mock 验证实时链路指标语义，需要 backend 在无 mysql 下启动。调研确认：

1. **无 mysql 启动有两道 fail-fast**：Joi `mysql_server_*` 4 个变量 required
   （`libs/config/src/validation.schema.ts:15-19`，缺失即抛错）+ TypeORM 默认 9×3s 重试后抛错
   （`node_modules/@nestjs/typeorm/dist/common/typeorm.utils.js:102`，`NestFactory.create` 失败退出）。
2. **实时链路零 DB 读**：`realtime-security-allowlist.service.ts:75-79` allowlist env 为空时
   不查库；`REALTIME_STRATEGY_MODE=off`（默认）不碰 BullMQ handoff；candle 聚合/finalizer/health
   全部无 TypeORM。
3. **无 redis 时聚合短路**：`realtime-market-data-product.service.ts:150,180,214` 三处
   `!isAvailable()` 短路——snapshot 不进聚合器，sealed/discard 恒 0。
4. **现成条件模块模式**：`app.module.ts:111-136` 的 `tdxRealtimeModulesForMode` /
   `qmtRealtimeModulesForMode`（装饰器里读 `process.env` 条件展开）——mock 模式同模式。
5. **Joi 支持 `.when()` 条件校验**：字段级 `Joi.string().when('MIST_MOCK_MODE', { is: 'true',
   then: Joi.optional(), otherwise: Joi.required() })`——单一 schema 同时服务两种模式。

## 决策

### 1. 单一 AppModule，不新增模块类（用户拍板：避免双模块漂移）

用户明确反对双模块（AppModule + MockAppModule）——每次加模块要同步两处，必然漂移。
方案：**只有一个 AppModule**，mock 与否由 `mockModeModulesForMode(isMock)` 条件展开表达：

```ts
export function mockModeModulesForMode(isMock: boolean) {
  return isMock ? [] : [
    TypeOrmModule.forRootAsync(...),   // 生产唯一持有
    HistoricalCollectorModule,
    RealtimeSubscriptionModule,
    IndicatorModule,
    SecurityModule,
    ChanModule,
    StrategyModule,
  ];
}
```

- **维护单一真相源**：加业务模块 → 只改这一处列表（mock 自动排除，因为 mock 分支是 `[]`）；
  加实时链路模块 → 只改 imports 里的固定位置（mock 自动继承，因为实时模块不在条件列表里）。
- **main.ts 零改动**：永远 `AppModule`，mock 与否由 env 决定——与 `tdxRealtimeModulesForMode`
  读 `process.env.TDX_REALTIME_MODE` 的现有模式完全一致。

### 2. 单一 schema，Joi .when() 条件化 mysql_server_*（不新增 schema）

`mistEnvSchema` 的 `mysql_server_*` 4 个字段改为 `.when('MIST_MOCK_MODE', { is: 'true',
then: Joi.optional(), otherwise: Joi.required() })`。生产不设 `MIST_MOCK_MODE` → 仍 required
（零回归）；mock 设 `true` → optional。`MIST_MOCK_MODE` 本身加进 schema
（`Joi.valid('true','false').default('false')`）。

- 不新增 `mistMockEnvSchema`（上次方案的 schema 分叉被消除）。
- `.custom()` 校验（queue limit / lifecycle-allowlist 冲突）保持不动，两种模式都生效。

### 3. 内存 allowlist 落在模块内部

`RealtimeIngressModule` 是 `@Global`，其 `TypeOrmModule.forFeature([SecuritySourceConfig])`
provider 注册在模块自身作用域——AppModule 层无法用同 token 覆盖。加
`realtimePersistenceModulesForMode(isMock)`：mock 时跳过 forFeature，另提供内存空 repository
（`useValue: {}` 空对象即可，因 allowlist env 为空时 `initialize()` 不查库；
`realtime-security-allowlist.service.ts:44-80` 在 lifecycle=on 或 allowlist 空时短路）。

### 4. Redis 必须保留

`MIST_REALTIME_REDIS_URL` 空 → 聚合短路。mock 验证 sealed/discard 必须起 redis
（本机 `redis:7-alpine` 容器，~50MB）。这是唯一必须的外部依赖。

### 5. REALTIME_STRATEGY_MODE=off 已关 BullMQ handoff

`realtimeStrategyHandoffModulesForMode('off')` 返回 `[]`，无需 mock 额外处理
（BullMQ 依赖的 Redis 与 candle 共用同一 URL）。

## Risks / Trade-offs

- [碰 backend 生产代码] → mock 默认关闭零回归（`MIST_MOCK_MODE` 不设即现状）+ 单测覆盖 +
  合 master 重新构建镜像。
- [Joi .when() 是仓库首次使用] → 有 spec 单测覆盖（mock 免 mysql 通过 / 生产缺 mysql 仍失败），
  `.when()` 是 Joi 核心能力，风险低。
- [内存 allowlist 掩盖 DB 语义] → mock 仅用于本地验证，生产路径（allowlist 非空走 DB）不变；
  spec 明示内存 allowlist 只在 allowlist env 为空时生效。

## Open Questions

- 无（技术路径已由调研确认，改动面明确，方向经用户拍板）。
