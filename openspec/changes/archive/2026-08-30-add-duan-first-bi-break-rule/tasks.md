# Tasks: add-duan-first-bi-break-rule

## 1. 算法改造（duan.ts）

- [ ] 1.1 `findSegmentEnd` `first === null` 分支：先执行 71 课判据，`confirmed` 时返回
      `{ endIdx: prev.biIndex - 1, nextStart: prev.biIndex }`；`extended/none` 落入现有吞并流程
- [ ] 1.2 新增 `firstBiBreak(bis, prev, direction)` 私有方法（方向对称；从转笔下一笔起按时间顺序
      竞争；转笔同向笔破终点 → confirmed、段向笔破起点 → extended；无界扫描）
- [ ] 1.3 确认判据确认的段恒为单笔（`endIdx === segStartIdx`），`buildDuan` 无需改动即可构建
      单笔 Complete 段（预演已验证）

## 2. 版本与契约

- [ ] 2.1 `ChanCore.algorithmVersion` 4 → 5（`chan-core.ts:27`）
- [ ] 2.2 `chan-core.spec.ts:25` 断言 4 → 5
- [ ] 2.3 `chan-full-output.characterization.spec.ts` 两处 `algorithmVersion: 2` payload 残留
      同步为 5（fingerprint SHA 重算）

## 3. 单测用例（duan.spec.ts）

- [ ] 3.1 判据确认用例：锚点 A 构型（Up 段单笔冲顶 + 转笔三笔破位 → 单笔段 + 新 Dn 段）
- [ ] 3.2 判据作废用例：转笔后第 2 笔先破转笔起点（旧段延续，输出与原逻辑一致）
- [ ] 3.3 单笔段合法用例：`startBi === endBi`、`type=complete`、`status=valid`
- [ ] 3.4 回归：现有 case1 / case2（含 "case 2 not confirmed"）用例保持通过

## 4. Characterization 快照

- [ ] 4.1 锚点窗口真实 K（06-18~06-29 与 07-07~07-15，5m/qmt/000001）固化为 fixture
      （`chan-full-output.characterization.fixture.ts` 新增或扩展）
- [ ] 4.2 新增 duan 层 fingerprint（`createDuan` 输出 SHA 锁定，含 8 处判据命中点）
- [ ] 4.3 主管道 fingerprint 复算（仅 algorithmVersion payload 2 → 5 导致 SHA 变化，bis/channels
      输出不变）

## 5. 全量验证与门禁

- [ ] 5.1 `libs/chancore` 全量测试通过（现有 174 基线 + 新增用例）
- [ ] 5.2 段链路回归：`duan-channel` / `central-expansion` / `buy-sell-point` / `divergence`
      确认 8 处单笔段不引入中枢/ZG/ZD/买卖点异常（与预演 33 段端点对照）
- [ ] 5.3 `pnpm typecheck` 通过
- [ ] 5.4 `pnpm lint:check` 通过
- [ ] 5.5 `openspec validate add-duan-first-bi-break-rule` 通过；delta 归档后
      `chan-duan-segment` live spec 同步（含 requirement 3 version 残留表述修正）