# realtime-subscription-hil

realtime 行情订阅的 **HIL（hardware-in-the-loop）验证 app**。本目录只是 Nest
monorepo 的入口 bootstrap；实际逻辑与单元测试都在 `apps/mist/src/realtime/hil/`。

## 为什么 HIL 是独立 app

HIL 必须在真实的 Windows 终端 / QMT 桌面 bridge / 交易时段环境里执行，对 TDX、QMT
provider 真发订阅、真收 snapshot，是一次性 CLI 进程（不是长驻服务）。因此它需要一个
独立的 `main.ts` 入口，挂靠在 Nest monorepo 下单独 `nest build`，不能并入主 backend
进程，也不能被 CI 替代（见
`docs/project-quality-governance-guide.md` §3.4 HIL 章节）。

## 代码布局（三者职责分离，不要混淆）

| 位置 | 职责 |
|------|------|
| `apps/realtime-subscription-hil/src/main.ts` | 入口：调用 `runRealtimeSubscriptionHilFromEnvironment()`，失败 `exitCode=1` |
| `apps/mist/src/realtime/hil/realtime-subscription-hil.ts` | HIL 全部逻辑：单源 verify/capture、双源 soak、QMT 生命周期观测 |
| `apps/mist/src/realtime/hil/*.spec.ts` / `.guard.spec.ts` | Jest 单元测试 + 结构守卫（断言 HIL 不进生产 AppModule） |
| `test/fixtures/realtime/realtime-native-frame-v2.json` | 跨仓库契约金标准 fixture（**不在这里**，见下） |

### 与 `test/fixtures/realtime/` 的关系

HIL **不重复** fixture，只通过路径哈希把它锚定到证据输出
（`realtime-subscription-hil.ts:221-224`、`:231`）：

```ts
const formalFixturePath = resolve(
  process.cwd(),
  'test/fixtures/realtime/realtime-native-frame-v2.json',
);
// ... formalFixtureSha256: sha256(formalFixturePath)
```

fixture 的实际内容（schema-v2 native frame 解码契约）由独立的单元测试
`apps/mist/src/realtime/realtime-native-map.decoder.fixture.spec.ts` 解码校验。
HIL 只证明"本次运行是在这个 pinned fixture 版本下执行的"，二者职责正交。

fixture 的跨仓库契约归属由 OpenSpec `cross-repo-contract-assets` spec 治理——
`mist-datasource` / `mist-deploy` / `mist-monitoring` 各存一份带 `.sha256` sidecar
的 pinned 拷贝，详见该 spec。

## 怎么跑

```bash
pnpm build:hil                    # nest build realtime-subscription-hil
pnpm hil:realtime-subscriptions   # node dist/apps/realtime-subscription-hil/main.js
```

通过 `MIST_HIL_*` 环境变量配置（profile、source、symbol、bridge health URL、soak
参数、evidence 输出路径等）。两个 profile：

- **单源 verify/capture**（默认）：驱动 `syncSubscriptions` / `subscribe` /
  `unsubscribe` / `getSubscriptions` 全生命周期，捕获 raw native fixture，校验订阅
  状态；QMT 额外观测 callback 停止 / 替换订阅 / ID 复用。
- **双源 soak**（`MIST_HIL_PROFILE=dual-source-soak`）：TDX + QMT mutation-free
  soak，采样 freshness / bridge health / QMT journal fingerprint。

证据落盘到 `MIST_HIL_EVIDENCE_PATH`，并归档进对应 OpenSpec change 的 `evidence/`。
