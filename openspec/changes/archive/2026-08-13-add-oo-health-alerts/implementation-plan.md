# 实施计划 — add-oo-health-alerts

> 2026-08-13。spec 已确认（D1-D5 + 独立 MQ + WeCom 独立 bot + QQ 共用 + F 盘）。
> 落地前置：本计划经用户确认后开工。

## 0. 前置事实（已逐行核实）

- deliver 基建在 `apps/notification`：
  - worker 模式：`strategy-alert-delivery.worker.ts`（`@Processor(NAME,{concurrency,maxStalledCount,prefix})` +
    WorkerHost + `process(job)` + Promise.race 硬 deadline）
  - producer：`alert-delivery-queue.service.ts`（`new Queue(NAME, {connection:
    parseRedisConnectionUrl(MIST_REALTIME_REDIS_URL), prefix, enableOfflineQueue:false...})` +
    OnModuleDestroy）
  - queue 注册：`notification-delivery.module.ts` `BullModule.registerQueue({name})`
  - adapter：`WeComChannelAdapter` 构造 `(config: ConfigService)` 读 `NOTIFICATION_WECHAT_WEBHOOK`；
    `QqChannelAdapter` 读 `NOTIFICATION_QQ_*`；`CHANNEL_ADAPTERS` factory 按 `NOTIFICATION_CHANNELS` 过滤
  - envelope：`notification-envelope.ts` `NotificationEnvelope`（channel-neutral）
  - 常量（QUEUE_NAME/PREFIX/JOB 名）在 `@app/signal`（策略契约）
- `TimezoneService.isTradingDay(date: Date): Promise<boolean>`（libs/timezone，SZSE + weekend fallback + cache）
- `candle-bucket.util.ts` A 股时段常量：09:30-11:31 / 13:00-15:01（half-open）
- OO alert API 路径 + webhook payload 格式：落地时确认（`/api/default/alerts` 之前 404）
- 生产部署：**docker_root=F:\MistDocker**（非 E）；OO 密码 <REDACTED>（见 AGENTS.md 已轮换凭据）
- mist 基线：typecheck/lint/test:ci（--forceExit）/coverage 82.72+；deploy gate test-*.ps1

## 1. 分支与工作流

- mist：`feat/add-oo-health-alerts` worktree（基于 master），提交序列：① spec 四件套 →
  ② libs/timezone session 提取 → ③ notification（queue/receiver/worker/envelope/adapter）→
  ④ tasks 勾选
- mist-deploy：直接 master（规则文件 + sync 脚本 + CI 门禁）

## 2. mist 侧改动（apps/notification + libs/timezone）

### 2.1 `libs/timezone`：session 判定提取（共享）

- 新增 `libs/timezone/src/trading-session.util.ts`：
  ```ts
  export const MORNING_START_MIN = 9 * 60 + 30;   // 09:30
  export const MORNING_END_MIN = 11 * 60 + 31;    // 11:31 half-open
  export const AFTERNOON_START_MIN = 13 * 60;     // 13:00
  export const AFTERNOON_END_MIN = 15 * 60 + 1;   // 15:01 half-open
  export function isInTradingHours(date: Date): boolean;  // 按 Asia/Shanghai 分钟数判定
  ```
- `candle-bucket.util.ts` 改为引用 libs 常量（避免双源；回归测试覆盖 candle 链路）。
- TimezoneService 保持（isTradingDay 不动）。

### 2.2 `apps/notification` 新增 `oo-alert/` 目录（本地常量，不进 @app/signal 策略契约）

**`oo-alert.constants.ts`**：
```ts
export const OO_ALERT_QUEUE_NAME = 'oo-alert-delivery';
export const OO_ALERT_BULLMQ_PREFIX = 'oo-alert';
export const OO_ALERT_JOB_TIMEOUT_MS = 15_000;
export const OO_ALERT_WORKER_CONCURRENCY = 1;
export const OO_ALERT_JOB = 'oo_alert';
export interface OoAlertJobV1 { alertName: string; source?: string;
  severity: 'P0'|'P1'|'P2'; ts: string; summary: string; }
```

**`oo-alert-queue.service.ts`**（producer，镜像 AlertDeliveryQueueService）：
```ts
@Injectable()
export class OoAlertQueueService implements OnModuleDestroy {
  private readonly queue: Queue;
  constructor(config: ConfigService) {
    this.queue = new Queue(OO_ALERT_QUEUE_NAME, {
      connection: { ...parseRedisConnectionUrl(config.get('MIST_REALTIME_REDIS_URL') ?? ''),
        enableOfflineQueue: false, maxRetriesPerRequest: 1, connectTimeout: 5000, commandTimeout: 3000 },
      prefix: OO_ALERT_BULLMQ_PREFIX,
    });
  }
  async enqueue(job: OoAlertJobV1): Promise<void>;
  // queue.add(OO_ALERT_JOB, job, {jobId: `${job.alertName}:${windowStartMs(job.ts)}`,
  //   attempts:3, backoff:{type:'exponential',delay:2000}, removeOnComplete:1000})
  // jobId 去重：同一 alert 同一时间窗口只入队一次（持续断流不刷屏，防告警风暴）
  onModuleDestroy(): Promise<void>;  // queue.close()
}
```

**`oo-alert-receiver.controller.ts`**：
```ts
@Controller('internal/oo-alert-receiver')
export class OoAlertReceiverController {
  constructor(config: ConfigService, private readonly queue: OoAlertQueueService,
              private readonly timezone: TimezoneService) {}
  @Post()
  async receive(@Headers('x-oo-alert-token') token, @Body() body): Promise<{accepted:boolean}> {
    // 1. token 校验（config OO_ALERT_RECEIVER_TOKEN，不匹配 → 401）
    // 2. parse body：{alertName, hits?/trigger?/ts}（对齐 OO destination payload，落地确认）
    // 3. isTradingSession = await timezone.isTradingDay(now) && isInTradingHours(now)
    //    非交易时段 → 丢弃（logger.log）→ 返回 {accepted:false}
    // 4. queue.enqueue({alertName, severity: deriveP(alertName), ts, summary})
    //    → 202 {accepted:true}；enqueue 失败 → 500
  }
}
```
- `deriveP(alertName)`：alertName 前缀（A1/A2→P0 等）→ severity（规则文件同源命名）。
- **挂载**：controller 注册进 `notification-app.module.ts`（或新 `oo-alert.module.ts`
  被 notification-app import）；`TimezoneModule` import（TimezoneService 注入，
  libs/timezone）。
- **O3 worker 的 adapter 注入**：独立 WeCom 实例（`OO_ALERT_WECHAT_WEBHOOK`）+
  **直接注入 `QqChannelAdapter` 单例**（不经 `CHANNEL_ADAPTERS` 过滤后的数组——那是
  策略按 NOTIFICATION_CHANNELS 过滤的）；worker 自己读 `NOTIFICATION_CHANNELS`
  判断是否发 QQ（当前 wechat only → 只发 WeCom）。

**`oo-alert-delivery.worker.ts`**（镜像 StrategyAlertDeliveryWorker）：
```ts
@Processor(OO_ALERT_QUEUE_NAME, { concurrency: 1, maxStalledCount: 0, prefix: OO_ALERT_BULLMQ_PREFIX })
export class OoAlertDeliveryWorker extends WorkerHost {
  constructor(config: ConfigService, private readonly counters: NotificationDeliveryCounters) { super(); }
  async process(job: Job<OoAlertJobV1, void, string>): Promise<void> {
    // deadline race（同策略 worker）
    // envelope = buildInfraEnvelope(job)
    // fan-out:
    //   wecomAdapter.send(envelope)（独立实例，OO_ALERT_WECHAT_WEBHOOK）
    //   qqAdapter.send(envelope)（共用，NOTIFICATION_QQ_*；仅当 NOTIFICATION_CHANNELS 含 qq）
    //   send 抛错 → throw（BullMQ retry attempts 3）
    //   permanent_failure → counters.record('oo_alert_send_failed') + error 日志
  }
}
```

**`infra-alert.envelope.ts`**：
```ts
export function buildInfraEnvelope(job: OoAlertJobV1): NotificationEnvelope;
// channel-neutral：title=`[Mist 告警][${severity}] ${alertName}`，body=summary+ts+source
// 复用 notification-envelope.ts 的 NotificationEnvelope 类型
```

**adapter 独立 bot**：`WeComChannelAdapter` 改造支持注入 webhook env 名：
```ts
constructor(config: ConfigService, webhookEnvName = 'NOTIFICATION_WECHAT_WEBHOOK') {}
// 读 config.get(webhookEnvName)；策略实例不传（默认），O3 实例传 'OO_ALERT_WECHAT_WEBHOOK'
```
（构造参数默认值——策略既有注入不变；O3 在 module 里
`{provide: OO_ALERT_WECHAT_ADAPTER, useFactory: (c) => new WeComChannelAdapter(c, 'OO_ALERT_WECHAT_WEBHOOK')}`）

**module**：`notification-app.module.ts`（或新 `oo-alert.module.ts`）注册
`BullModule.registerQueue({name: OO_ALERT_QUEUE_NAME})` + OoAlertQueueService +
OoAlertReceiverController + OoAlertDeliveryWorker + OO_ALERT_WECHAT_ADAPTER +
QqChannelAdapter（共用实例）+ NotificationDeliveryCounters + `TimezoneModule` import。

### 2.3 配置（apps/notification 侧）

- `OO_ALERT_RECEIVER_TOKEN`（mist-deploy secret → env，git 零凭据）
- `OO_ALERT_WECHAT_WEBHOOK`（独立 bot）
- QQ 复用 `NOTIFICATION_QQ_*`（不新增）
- `libs/config/src/validation.schema.ts`：`OO_ALERT_RECEIVER_TOKEN` 必填、
  `OO_ALERT_WECHAT_WEBHOOK` 可选（wechat 未配时 alert 走 QQ 或日志）。

## 3. mist-deploy 侧

- `oo-alerts/rules.json`：6 项（A1-A6）——name/severity/stream/sql/frequency/
  window/condition（design §2 草案，落地对齐 OO scheduled-alert 语法；A1/A4 若 OO
  不支持变化检测改 age-based）。
- `oo-alerts/destinations.json`：webhook destination（receiver URL +
  `X-Oo-Alert-Token` header）。
- `scripts/sync-oo-alerts.ps1`：
  - 读 rules.json/destinations.json → OO REST API 幂等创建/更新（GET 查存在 →
    POST/PUT；落地确认 OO alert API 路径）。
  - OO API 认证：读 .env `OO_ROOT_USER_PASSWORD`（Basic auth），脚本不落凭据
    （G2 惯例：git 零凭据）。
  - openobserve healthy 后运行（deploy workflow 或 compose 接入）。
- `.env.example` + `deploy-defaults.ps1`：`OO_ALERT_RECEIVER_TOKEN`（secret 注入）、
  `OO_ALERT_WECHAT_WEBHOOK`（占位/注释）。
- CI 门禁：`test-docker-compose-config.ps1`/`test-workflow-config.ps1` 断言
  rules.json 6 项 + sync 脚本存在 + env 占位（ASCII needle，PS 5.1 编码坑）。

## 4. 测试用例

- `libs/timezone`：`trading-session.util.spec.ts`——09:30/11:30/13:00/15:00 边界、
  午休 11:31-12:59 不在、盘后/周末不在。
- `oo-alert-receiver.controller.spec.ts`：token 错 401；非交易时段（mock
  timezone+session）→ 丢弃 + queue 未调；交易时段 → enqueue 调用 + jobId 去重
  （mock Queue）。
- `oo-alert-delivery.worker.spec.ts`：job → envelope 字段；send 抛错 → throw；
  permanent_failure → counters 记录；QQ 未启用（CHANNELS 无 qq）→ 只发 WeCom。
- `wechat.channel-adapter.spec.ts`（扩展）：webhookEnvName 注入 → 读对应 env。
- 覆盖门槛：新增行 100% 覆盖（含 session 边界分支）。

## 5. 验证命令

### mist（worktree）
```bash
pnpm typecheck && pnpm lint:check
pnpm exec jest libs/timezone apps/notification --runInBand
env TZ=UTC pnpm run test:ci
pnpm run test:coverage
openspec validate --all --strict
git diff --check
```

### mist-deploy
```bash
pwsh-preview -Command "& './scripts/test-docker-compose-config.ps1'"
# sync-oo-alerts.ps1 dry-run（本地 OO 或生产，幂等验证）
```

## 6. 收尾顺序（确认后逐步执行）

1. 合并 + push（mist / mist-deploy）
2. 部署（mist tag + deploy；**docker_root=F:\MistDocker**；productization=shadow；
   skip_qmt_runtime 按 QMT 状态）
3. sync-oo-alerts.ps1 灌 OO（6 alert + destination）
4. 生产验证：OO alert 列表 6 项；交易时段注入断流（临时停 TDX 或 mock）→ alert
   触发 → receiver → queue → worker → 微信/QQ 收到；非交易时段丢弃
5. 规则重建验证：删 alert → sync 重灌 → 恢复
6. tasks 勾选 + 归档（--skip-specs）

## 7. 风险与注意

- **OO alert API 路径 + webhook payload 格式未确认**（`/api/default/alerts` 404）——
  落地第一步先探 OO API（swagger 或文档），再定 sync 脚本 + receiver parse。
  **A1/A4"不增"检测同理**：若 OO scheduled alert 不支持"对比窗口/变化检测"，
  改用 age-based——A1 = `mist_datasource_snapshot_age_seconds > 阈值`（已有 Gauge，
  更直接）；A4 = sealed 最近封存时间 age。落地探 OO alert 能力后定 SQL 形态。
- **QQ 未启用**（生产 `NOTIFICATION_CHANNELS=wechat`）：O3 QQ 投递仅当 CHANNELS 含
  qq；当前 O3 告警走 WeCom 独立 bot + QQ 待启用（或用户改 CHANNELS + 部署）。
- **WeComChannelAdapter 构造加默认参数**：策略既有注入不变（默认 env 名），
  兼容（回归测试覆盖）。
- **token/凭据**：`OO_ALERT_RECEIVER_TOKEN` + `OO_ALERT_WECHAT_WEBHOOK` 走
  .env/secret（git 零凭据，G2 惯例）；测试/文档不落真实值。
- 交易时段判定依赖 SZSE API（fallback weekend）——节假日（非周末）可能误判为
  交易日 → alert 在节假日触发（receiver 静默丢弃非交易时段？节假日是交易日历
  非交易——isTradingDay 可能 true（非周末）→ 触发。可接受（低频 + 内容准确）或
  后续调优。
