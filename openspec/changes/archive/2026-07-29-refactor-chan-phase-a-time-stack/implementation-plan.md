# Phase A 单时间栈归约 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留已验证的两阶段规则，将 Phase A 单时间栈和 Phase B invalid 区间归约最终内联到 `BiService`，并在完整沪深300、完整上证指数和原有 Phase B 场景上完成零结果变化的 TDD 回归。

**Architecture:** helper 文件是已完成的独立验证中间物；最终 `BiService` 直接拥有 `reducePhaseATimeStack`、`isPhaseBMergeableSpan` 和 `mergeBiSegments` 私有方法，并直调既有合并与 valid 原语。完整真实数据测试保存在后端仓库内；本次只验证 `mist-fe` 既有快照，不刷新它们。

**Tech Stack:** TypeScript 5.1、NestJS 10、Jest 29、OpenSpec、pnpm、Next.js、ECharts 快照测试页。

## Global Constraints

- Phase A 与 Phase B 的生产算法 MUST 最终位于 `BiService` 私有方法；`bi-phase-a-time-stack.helper.ts`、`bi-phase-b-merge.helper.ts` 和 operations 接口 MUST 删除。
- 原 helper 的 7 个 Phase A、9 个 Phase B 测试场景 MUST 保留并迁移为 NestJS Test module 的 service-phase specs。
- Phase A 每次候选入栈后 MUST 反复归约连续栈顶三笔，直到不足三笔、三笔全 Valid 或当前三笔不可合并。
- Phase A MUST 在候选入栈前和三笔合并前校验共享 `middleIndex` 边界。
- 每次合并 MUST 重新调用现有 `isCandidateBiValid`；不得修改现有三笔、两笔、分型、宽笔或价格包络规则。
- 完整沪深300 388 根与完整上证指数 386 根合并 K MUST 成为后端仓库内可独立运行的 fixture。
- 必须先观察完整沪深300在旧双数组实现下按预期 RED，再修改生产算法。
- 已完成的 helper 独立测试是行为基线；内联后不得以修改快照或测试期望掩盖差异。
- `{ phaseA, phaseB }`、HTTP 返回结构、Channel 使用 Phase B 的行为保持不变。
- 工作区存在其他 OpenSpec/路线图改动；每次提交只暂存本计划列出的文件。

---

## File Map

### Phase C 后端迁移

- `apps/mist/src/chan/services/bi.service.ts`：内联 `reducePhaseATimeStack`、
  `isPhaseBMergeableSpan` 和 `mergeBiSegments`，直接调用既有私有原语。
- `apps/mist/src/chan/services/bi-phase-a-time-stack.helper.spec.ts` →
  `apps/mist/src/chan/services/bi.service.phase-a.spec.ts`：迁移 7 个 Phase A 场景。
- `apps/mist/src/chan/services/bi-phase-b-merge.helper.spec.ts` →
  `apps/mist/src/chan/services/bi.service.phase-b.spec.ts`：迁移 9 个 Phase B 场景。
- 删除 `bi-phase-a-time-stack.helper.ts`、`bi-phase-b-merge.helper.ts`；更新
  `bi.service.spec.ts` 结构断言和 OpenSpec tasks/evidence。

### Phase C 前端验证（只读）

- `mist-fe` 的四组阶段快照、`meta.json`、生成脚本和页面源码均不在本次修改范围。
- 仅运行 typecheck、lint、test:ci 和零 diff 检查；不得生成或刷新快照。

---

> 以下 Task 1–6 是已完成的独立 helper 验证与接入记录，保留它们作为行为基线和证据；其
> helper 文件/快照刷新描述不再定义最终生产结构。最终结构与当前执行顺序以文末 Phase C 为准。

### Task 1: 建立完整真实快照 RED 回归

**Files:**
- Create: `apps/mist/src/chan/services/__fixtures__/csi300-2024-2025-full.json`
- Create: `apps/mist/src/chan/services/__fixtures__/shanghai-index-2024-2025-full.json`
- Create: `apps/mist/src/chan/services/bi-phase-a-real-snapshots.spec.ts`
- Modify: `openspec/changes/refactor-chan-phase-a-time-stack/tasks.md`

**Interfaces:**
- Consumes: 当前 `BiService.getBi(data: MergedKVo[]): { phaseA: BiVo[]; phaseB: BiVo[] }`。
- Produces: `loadMergedKSnapshot`、`findValidCompleteOverlaps`、`hasIndexedBi`，供两个完整快照测试复用。

- [ ] **Step 1: 机械复制两份完整 merge-k fixture**

Run from `/Users/moyui/sean/mist/mist`:

```bash
cp ../mist-fe/__fixtures__/snapshots/chan/csi300-2024-2025/merge-k.json \
  apps/mist/src/chan/services/__fixtures__/csi300-2024-2025-full.json
cp ../mist-fe/__fixtures__/snapshots/chan/shanghai-index-2024-2025/merge-k.json \
  apps/mist/src/chan/services/__fixtures__/shanghai-index-2024-2025-full.json
```

Verify exact source size and entry count:

```bash
node -e "for (const p of ['apps/mist/src/chan/services/__fixtures__/csi300-2024-2025-full.json','apps/mist/src/chan/services/__fixtures__/shanghai-index-2024-2025-full.json']) console.log(p, require('./'+p).length)"
```

Expected:

```text
...csi300-2024-2025-full.json 388
...shanghai-index-2024-2025-full.json 386
```

- [ ] **Step 2: 写完整快照服务级失败测试**

Create `apps/mist/src/chan/services/bi-phase-a-real-snapshots.spec.ts` with this structure:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BiStatus, BiType } from '../enums/bi.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import type { BiVo } from '../vo/bi.vo';
import type { MergedKVo } from '../vo/merged-k.vo';
import { BiService } from './bi.service';

const FIXTURES_DIR = join(__dirname, '__fixtures__');

function loadMergedKSnapshot(filename: string): MergedKVo[] {
  const raw = JSON.parse(
    readFileSync(join(FIXTURES_DIR, filename), 'utf8'),
  ) as Record<string, unknown>[];

  return raw.map((merge) => ({
    startTime: new Date(merge.startTime as string),
    endTime: new Date(merge.endTime as string),
    highest: Number(merge.highest),
    lowest: Number(merge.lowest),
    trend: merge.trend as TrendDirection,
    mergedCount: Number(merge.mergedCount),
    mergedIds: (merge.mergedIds as number[]).map(Number),
    mergedData: (merge.mergedData as Record<string, unknown>[]).map((k) => ({
      id: Number(k.id),
      symbol: String(k.symbol),
      time: new Date(k.time as string),
      amount: Number(k.amount),
      open: Number(k.open),
      close: Number(k.close),
      highest: Number(k.highest),
      lowest: Number(k.lowest),
    })),
  })) as MergedKVo[];
}

type IndexedRange = readonly [number, number];

function isValidCompleteBi(bi: BiVo): boolean {
  return (
    bi.type === BiType.Complete &&
    bi.status === BiStatus.Valid &&
    Boolean(bi.startFenxing && bi.endFenxing)
  );
}

function indexedRange(bi: BiVo): IndexedRange {
  if (!bi.startFenxing || !bi.endFenxing) {
    throw new Error('Expected a Complete Bi with both fenxings');
  }
  return [bi.startFenxing.middleIndex, bi.endFenxing.middleIndex];
}

function findValidCompleteOverlaps(bis: readonly BiVo[]) {
  const validBis = bis.filter(isValidCompleteBi);
  const overlaps: Array<{ outer: IndexedRange; inner: IndexedRange }> = [];

  for (let left = 0; left < validBis.length; left++) {
    for (let right = left + 1; right < validBis.length; right++) {
      const leftRange = indexedRange(validBis[left]);
      const rightRange = indexedRange(validBis[right]);
      if (leftRange[0] < rightRange[1] && rightRange[0] < leftRange[1]) {
        overlaps.push({ outer: leftRange, inner: rightRange });
      }
    }
  }
  return overlaps;
}

function hasIndexedBi(
  bis: readonly BiVo[],
  expected: {
    start: number;
    end: number;
    trend: TrendDirection;
    status: BiStatus;
  },
): boolean {
  return bis.some(
    (bi) =>
      bi.startFenxing?.middleIndex === expected.start &&
      bi.endFenxing?.middleIndex === expected.end &&
      bi.trend === expected.trend &&
      bi.status === expected.status,
  );
}

function expectContinuousLocalFixedPoint(
  service: BiService,
  bis: readonly BiVo[],
): void {
  const complete = bis.filter(
    (bi) =>
      bi.type === BiType.Complete && bi.startFenxing && bi.endFenxing,
  );

  for (let index = 1; index < complete.length; index++) {
    expect(complete[index].startFenxing?.middleIndex).toBe(
      complete[index - 1].endFenxing?.middleIndex,
    );
  }

  for (let index = 0; index + 2 < complete.length; index++) {
    const triple = complete.slice(index, index + 3);
    if (triple.every((bi) => bi.status === BiStatus.Valid)) continue;
    expect(
      service['canMergeThreeBis'](triple[0], triple[1], triple[2]),
    ).toBe(false);
  }
}

describe('BiService Phase A full real snapshots', () => {
  let service: BiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService],
    }).compile();
    service = module.get(BiService);
  });

  it('keeps the full CSI 300 Phase A stack non-overlapping', () => {
    const data = loadMergedKSnapshot('csi300-2024-2025-full.json');
    const { phaseA } = service.getBi(data);
    const overlaps = findValidCompleteOverlaps(phaseA);
    const keepsKnownWitness = overlaps.some(
      ({ outer, inner }) =>
        outer[0] === 206 &&
        outer[1] === 302 &&
        inner[0] === 222 &&
        inner[1] === 228,
    );

    expect({ overlaps, keepsKnownWitness }).toEqual({
      overlaps: [],
      keepsKnownWitness: false,
    });
    expectContinuousLocalFixedPoint(service, phaseA);
  });

  it('preserves the complete Shanghai index regression', () => {
    const data = loadMergedKSnapshot('shanghai-index-2024-2025-full.json');
    const { phaseA, phaseB } = service.getBi(data);

    expect(phaseA).toHaveLength(35);
    expect(phaseB).toHaveLength(25);
    expect(
      hasIndexedBi(phaseA, {
        start: 142,
        end: 146,
        trend: TrendDirection.Down,
        status: BiStatus.Invalid,
      }),
    ).toBe(true);
    expect(
      hasIndexedBi(phaseB, {
        start: 142,
        end: 195,
        trend: TrendDirection.Down,
        status: BiStatus.Valid,
      }),
    ).toBe(true);
    expect(
      hasIndexedBi(phaseB, {
        start: 266,
        end: 317,
        trend: TrendDirection.Up,
        status: BiStatus.Valid,
      }),
    ).toBe(true);
    expectContinuousLocalFixedPoint(service, phaseA);
  });
});
```

- [ ] **Step 3: 运行测试并确认旧实现按预期 RED**

Run:

```bash
npx jest --runInBand --watchman=false --testPathPattern="bi-phase-a-real-snapshots"
```

Expected failure evidence:

```text
CSI 300: overlaps contains 8 pairs and keepsKnownWitness is true
Shanghai: expected Phase A length 35, received 47
```

If the test errors on fixture parsing or module loading instead of these assertions, fix the test harness and rerun until the failure reason matches.

- [ ] **Step 4: 更新 OpenSpec task 1 并提交 RED 基线**

Mark tasks `1.1` through `1.3` complete, then commit only the two fixtures, the new spec, and `tasks.md`:

```bash
git add \
  apps/mist/src/chan/services/__fixtures__/csi300-2024-2025-full.json \
  apps/mist/src/chan/services/__fixtures__/shanghai-index-2024-2025-full.json \
  apps/mist/src/chan/services/bi-phase-a-real-snapshots.spec.ts \
  openspec/changes/refactor-chan-phase-a-time-stack/tasks.md
git commit -m "test(chan): reproduce phase A time-stack regressions"
```

---

### Task 2: 独立实现并验证 Phase A helper

**Files:**
- Create: `apps/mist/src/chan/services/bi-phase-a-time-stack.helper.spec.ts`
- Create: `apps/mist/src/chan/services/bi-phase-a-time-stack.helper.ts`
- Modify: `openspec/changes/refactor-chan-phase-a-time-stack/tasks.md`

**Interfaces:**
- Consumes: `BiVo`, `BiStatus`, `BiType`，以及调用方提供的三个 operations 回调。
- Produces:

```typescript
export interface PhaseATimeStackOperations {
  canMergeThreeBis(first: BiVo, middle: BiVo, third: BiVo): boolean;
  mergeThreeBis(first: BiVo, third: BiVo): BiVo;
  isCandidateBiValid(bi: BiVo): boolean;
}

export function reducePhaseATimeStack(
  candidates: readonly BiVo[],
  operations: PhaseATimeStackOperations,
): BiVo[];
```

- [ ] **Step 1: 写纯 helper RED 单元测试**

Create `apps/mist/src/chan/services/bi-phase-a-time-stack.helper.spec.ts`. Use real `BiVo` values and mocked operations, not a NestJS module. The key cascade test MUST exercise two reductions caused by one final candidate:

```typescript
import { BiStatus, BiType } from '../enums/bi.enum';
import { FenxingType } from '../enums/fenxing.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import type { BiVo } from '../vo/bi.vo';
import type { FenxingVo } from '../vo/fenxing.vo';
import {
  reducePhaseATimeStack,
  type PhaseATimeStackOperations,
} from './bi-phase-a-time-stack.helper';

function createFenxing(index: number, type: FenxingType): FenxingVo {
  return {
    type,
    highest: index + 20,
    lowest: index + 10,
    leftIds: [index * 10 - 1],
    middleIds: [index * 10],
    rightIds: [index * 10 + 1],
    middleIndex: index,
    middleOriginId: index * 10,
  };
}

function createBi(
  start: number,
  end: number,
  trend: TrendDirection,
  status: BiStatus,
): BiVo {
  return {
    startTime: new Date(Date.UTC(2026, 0, start + 1)),
    endTime: new Date(Date.UTC(2026, 0, end + 1)),
    highest: end + 20,
    lowest: start + 10,
    trend,
    type: BiType.Complete,
    status,
    independentCount: end - start,
    originIds: [start, end],
    originData: [],
    startFenxing: createFenxing(
      start,
      trend === TrendDirection.Up ? FenxingType.Bottom : FenxingType.Top,
    ),
    endFenxing: createFenxing(
      end,
      trend === TrendDirection.Up ? FenxingType.Top : FenxingType.Bottom,
    ),
  };
}

function rangeKey(bi: BiVo): string {
  return `${bi.startFenxing?.middleIndex}-${bi.endFenxing?.middleIndex}`;
}

function createOperations(
  canMerge: PhaseATimeStackOperations['canMergeThreeBis'],
  isValid: PhaseATimeStackOperations['isCandidateBiValid'] = () => true,
): jest.Mocked<PhaseATimeStackOperations> {
  return {
    canMergeThreeBis: jest.fn(canMerge),
    mergeThreeBis: jest.fn((first, third) => ({
      ...first,
      endTime: third.endTime,
      highest: Math.max(first.highest, third.highest),
      lowest: Math.min(first.lowest, third.lowest),
      status: BiStatus.Unknown,
      independentCount: first.independentCount + third.independentCount,
      originIds: [...first.originIds, ...third.originIds],
      endFenxing: third.endFenxing,
    })),
    isCandidateBiValid: jest.fn(isValid),
  };
}

describe('reducePhaseATimeStack', () => {
  it('repeats top-three reduction until the new stack top is stable', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
      createBi(3, 4, TrendDirection.Down, BiStatus.Invalid),
      createBi(4, 5, TrendDirection.Up, BiStatus.Valid),
    ];
    const allowed = new Set([
      '2-3|3-4|4-5',
      '0-1|1-2|2-5',
    ]);
    const operations = createOperations(
      (first, middle, third) =>
        allowed.has(`${rangeKey(first)}|${rangeKey(middle)}|${rangeKey(third)}`),
      (bi) => bi.startFenxing?.middleIndex === 0,
    );

    const result = reducePhaseATimeStack(candidates, operations);

    expect(result).toHaveLength(1);
    expect(rangeKey(result[0])).toBe('0-5');
    expect(result[0].status).toBe(BiStatus.Valid);
    expect(operations.mergeThreeBis).toHaveBeenCalledTimes(2);
    expect(operations.isCandidateBiValid).toHaveBeenCalledTimes(2);
  });

  it('stops when the top three are all Valid', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Valid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
    ];
    const operations = createOperations(() => true);

    const result = reducePhaseATimeStack(candidates, operations);

    expect(result.map(rangeKey)).toEqual(['0-1', '1-2', '2-3']);
    expect(operations.canMergeThreeBis).not.toHaveBeenCalled();
  });

  it('retains an Invalid top group when it cannot merge', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
    ];
    const operations = createOperations(() => false);

    const result = reducePhaseATimeStack(candidates, operations);

    expect(result.map(rangeKey)).toEqual(['0-1', '1-2', '2-3']);
    expect(operations.mergeThreeBis).not.toHaveBeenCalled();
  });

  it('retains leading Invalid candidates', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Invalid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
    ];
    const result = reducePhaseATimeStack(
      candidates,
      createOperations(() => false),
    );
    expect(result.map((bi) => bi.status)).toEqual([
      BiStatus.Invalid,
      BiStatus.Invalid,
    ]);
  });

  it('rejects a discontinuous candidate before pushing it', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(2, 3, TrendDirection.Down, BiStatus.Invalid),
    ];
    expect(() =>
      reducePhaseATimeStack(candidates, createOperations(() => false)),
    ).toThrow('non-contiguous Bis 0-1 -> 2-3');
  });

  it('rejects a merged Bi that changes the outer boundary', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
    ];
    const operations = createOperations(() => true);
    operations.mergeThreeBis.mockImplementation(() =>
      createBi(1, 3, TrendDirection.Up, BiStatus.Unknown),
    );
    expect(() => reducePhaseATimeStack(candidates, operations)).toThrow(
      'merged Bi 1-3 does not preserve 0-3',
    );
  });

  it('does not mutate the input array or Bi objects', () => {
    const first = Object.freeze(
      createBi(0, 1, TrendDirection.Up, BiStatus.Invalid),
    ) as BiVo;
    const second = Object.freeze(
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
    ) as BiVo;
    const candidates = Object.freeze([first, second]);

    const result = reducePhaseATimeStack(
      candidates,
      createOperations(() => false),
    );

    expect(candidates).toEqual([first, second]);
    expect(result[0]).not.toBe(first);
    expect(result[1]).not.toBe(second);
  });
});
```

- [ ] **Step 2: 运行 helper 测试并确认缺少模块导致 RED**

```bash
npx jest --runInBand --watchman=false --testPathPattern="bi-phase-a-time-stack.helper"
```

Expected: FAIL because `./bi-phase-a-time-stack.helper` does not exist. Fix test syntax errors first if the failure is unrelated.

- [ ] **Step 3: 实现最小纯 helper**

Create `apps/mist/src/chan/services/bi-phase-a-time-stack.helper.ts`:

```typescript
import { BiStatus, BiType } from '../enums/bi.enum';
import type { BiVo } from '../vo/bi.vo';
import type { FenxingVo } from '../vo/fenxing.vo';

type CompleteBi = BiVo & {
  startFenxing: FenxingVo;
  endFenxing: FenxingVo;
};

export interface PhaseATimeStackOperations {
  canMergeThreeBis(first: BiVo, middle: BiVo, third: BiVo): boolean;
  mergeThreeBis(first: BiVo, third: BiVo): BiVo;
  isCandidateBiValid(bi: BiVo): boolean;
}

function assertCompleteBi(
  bi: BiVo,
  label: string,
): asserts bi is CompleteBi {
  if (bi.type !== BiType.Complete || !bi.startFenxing || !bi.endFenxing) {
    throw new Error(
      `Phase A time stack invariant failed: ${label} must be Complete`,
    );
  }
}

function rangeOf(bi: CompleteBi): string {
  return `${bi.startFenxing.middleIndex}-${bi.endFenxing.middleIndex}`;
}

function assertAdjacent(previous: CompleteBi, current: CompleteBi): void {
  if (
    previous.endFenxing.middleIndex !== current.startFenxing.middleIndex
  ) {
    throw new Error(
      `Phase A time stack invariant failed: non-contiguous Bis ${rangeOf(previous)} -> ${rangeOf(current)}`,
    );
  }
}

function assertOuterBoundary(
  merged: CompleteBi,
  first: CompleteBi,
  third: CompleteBi,
): void {
  const expectedStart = first.startFenxing.middleIndex;
  const expectedEnd = third.endFenxing.middleIndex;
  if (
    merged.startFenxing.middleIndex !== expectedStart ||
    merged.endFenxing.middleIndex !== expectedEnd
  ) {
    throw new Error(
      `Phase A time stack invariant failed: merged Bi ${rangeOf(merged)} does not preserve ${expectedStart}-${expectedEnd}`,
    );
  }
}

export function reducePhaseATimeStack(
  candidates: readonly BiVo[],
  operations: PhaseATimeStackOperations,
): BiVo[] {
  const stack: BiVo[] = [];

  for (const sourceCandidate of candidates) {
    const candidate: BiVo = { ...sourceCandidate };
    assertCompleteBi(candidate, 'candidate');

    if (stack.length > 0) {
      const previous = stack[stack.length - 1];
      assertCompleteBi(previous, 'stack tail');
      assertAdjacent(previous, candidate);
    }
    stack.push(candidate);

    while (stack.length >= 3) {
      const first = stack[stack.length - 3];
      const middle = stack[stack.length - 2];
      const third = stack[stack.length - 1];
      assertCompleteBi(first, 'first');
      assertCompleteBi(middle, 'middle');
      assertCompleteBi(third, 'third');
      assertAdjacent(first, middle);
      assertAdjacent(middle, third);

      const allValid =
        first.status === BiStatus.Valid &&
        middle.status === BiStatus.Valid &&
        third.status === BiStatus.Valid;
      if (allValid) break;
      if (!operations.canMergeThreeBis(first, middle, third)) break;

      const merged = operations.mergeThreeBis(first, third);
      assertCompleteBi(merged, 'merged Bi');
      assertOuterBoundary(merged, first, third);
      const replacement: BiVo = {
        ...merged,
        status: operations.isCandidateBiValid(merged)
          ? BiStatus.Valid
          : BiStatus.Invalid,
      };
      stack.splice(stack.length - 3, 3, replacement);
    }
  }

  return stack;
}
```

- [ ] **Step 4: 运行 helper 单测直到独立 GREEN**

```bash
npx jest --runInBand --watchman=false --testPathPattern="bi-phase-a-time-stack.helper"
```

Expected: 1 suite passes, all helper tests pass. Do not edit `bi.service.ts` during this step.

- [ ] **Step 5: 更新 OpenSpec task 2 并提交 helper 独立边界**

```bash
git add \
  apps/mist/src/chan/services/bi-phase-a-time-stack.helper.ts \
  apps/mist/src/chan/services/bi-phase-a-time-stack.helper.spec.ts \
  openspec/changes/refactor-chan-phase-a-time-stack/tasks.md
git commit -m "feat(chan): add phase A time-stack helper"
```

---

### Task 3: 将两个独立 helper 组合进 BiService

**Files:**
- Modify: `apps/mist/src/chan/services/bi.service.ts`
- Modify: `apps/mist/src/chan/services/bi.service.spec.ts`
- Verify unchanged: `apps/mist/src/chan/services/bi-phase-b-merge.helper.ts`
- Verify unchanged: `apps/mist/src/chan/chan.controller.ts:188-189`
- Modify: `openspec/changes/refactor-chan-phase-a-time-stack/tasks.md`

**Interfaces:**
- Consumes: `reducePhaseATimeStack(candidates, phaseAOperations)` from Task 2 and existing `mergeBiSegments(phaseA, phaseBOperations)`.
- Produces: unchanged `BiTwoPhaseResult { phaseA: BiVo[]; phaseB: BiVo[] }`.

- [ ] **Step 1: 在 BiService 导入 Phase A helper 并替换 getBi 组合逻辑**

Add the import next to the Phase B import:

```typescript
import { reducePhaseATimeStack } from './bi-phase-a-time-stack.helper';
import { mergeBiSegments } from './bi-phase-b-merge.helper';
```

Replace the Phase A/Phase B section in `getBi` with:

```typescript
const completePhaseA = reducePhaseATimeStack(candidates, {
  canMergeThreeBis: (first, middle, third) =>
    this.canMergeThreeBis(first, middle, third),
  mergeThreeBis: (first, third) => this.mergeThreeBis(first, third, data),
  isCandidateBiValid: (bi) => this.isCandidateBiValid(bi),
});
const phaseA = this.buildFinalUncompleteBi(completePhaseA, data);

const phaseB = mergeBiSegments(phaseA, {
  canMergeTwoBis: (head, tail) => this.canMergeTwoBis(head, tail),
  mergeTwoBis: (head, tail) => this.mergeTwoBis(head, tail, data),
  isCandidateBiValid: (bi) => this.isCandidateBiValid(bi),
});
```

Update the class comment from “递推+回退” to “Phase A 单时间栈 + Phase B invalid 区间归约”.

- [ ] **Step 2: 简化 unfinished-tail 方法并删除双数组状态机**

Change the method signature and initial result construction to:

```typescript
private buildFinalUncompleteBi(
  completeStack: readonly BiVo[],
  data: MergedKVo[],
): BiVo[] {
  const result = completeStack.map((bi) => ({ ...bi }));
```

Keep the existing empty-input and unfinished-tail branches from that point onward. Delete these obsolete definitions in full:

```text
BiSourceTag
processCandidateBisWithRollback
tryAddBi
getLastBi
getLastLastBi
handleThreeBi
removeBiByIndex
removeBiByFrom
pushBi
```

Keep `getThreePattern`, `canMergeThreeBis`, `mergeThreeBis`, `canMergeTwoBis`, and `mergeTwoBis`, because they are the operations used by the two helpers.

- [ ] **Step 3: 更新 BiService 单测的架构断言**

Delete the obsolete test `removeBiByIndex should remove only the requested item` from `bi.service.spec.ts`. Extend the existing source-boundary test to verify the two independent helpers:

```typescript
it('composes independent Phase A and Phase B helper boundaries', () => {
  const source = readFileSync(join(__dirname, 'bi.service.ts'), 'utf8');

  expect(source).toContain('reducePhaseATimeStack');
  expect(source).toContain('mergeBiSegments');
  expect(source).not.toContain('BiSourceTag');
  expect(source).not.toContain('processCandidateBisWithRollback');
  expect(source).not.toContain('confirmed: BiVo[]');
  expect(source).not.toContain('pending: BiVo[]');
});
```

Do not change the existing public-output characterization unless its failure shows an intentional Phase A result change; if it changes, update only the exact expected Phase A value and explain the structural reason in the commit.

Retain the existing `characterizes public getBi output for a focused merged-K fixture` and `preserves range fields for candidate, merge, and unfinished Bi construction` tests; together they remain the explicit trailing-UnComplete regression required by the spec.

- [ ] **Step 4: 运行 helper、service 和完整快照测试**

```bash
npx jest --runInBand --watchman=false \
  --testPathPattern="bi-phase-a-time-stack|bi-phase-a-real-snapshots|bi.service.spec"
```

Expected:

```text
Phase A helper suite PASS
BiService suite PASS
CSI 300 full snapshot PASS with no 206-302 overlap witness
Shanghai full snapshot PASS with Phase A 35 / Phase B 25
```

- [ ] **Step 5: 更新 OpenSpec task 3 并提交服务集成**

```bash
git add \
  apps/mist/src/chan/services/bi.service.ts \
  apps/mist/src/chan/services/bi.service.spec.ts \
  openspec/changes/refactor-chan-phase-a-time-stack/tasks.md
git commit -m "refactor(chan): integrate phase A time stack"
```

---

### Task 4: 验证完整后端回归

**Files:**
- Verify: `apps/mist/src/chan/services/bi-merge-cases.spec.ts`
- Verify: `apps/mist/src/chan/services/bi-phase-b-merge.helper.spec.ts`
- Verify: `apps/mist/src/chan/services/channel.service.spec.ts`
- Modify only if evidence requires: `apps/mist/src/chan/services/bi-phase-a-real-snapshots.spec.ts`
- Modify: `openspec/changes/refactor-chan-phase-a-time-stack/tasks.md`

**Interfaces:**
- Consumes: integrated `BiService` from Task 3.
- Produces: verified backend boundary ready for snapshot regeneration.

- [ ] **Step 1: 运行原上证指数 6 个 Phase B 测试**

```bash
npx jest --runInBand --watchman=false --testPathPattern="bi-merge-cases"
```

Expected: 1 suite, 6/6 tests pass; Phase B retains the October long down and May-August long up endpoints.

- [ ] **Step 2: 运行两个 helper、BiService 和 Channel 聚焦测试**

```bash
npx jest --runInBand --watchman=false \
  --testPathPattern="bi-phase-a-time-stack|bi-phase-b-merge|bi.service.spec|channel.service.spec"
```

Expected: all selected suites pass. `bi-phase-b-merge.helper.ts` must have no production diff.

- [ ] **Step 3: 运行后端静态与全量验证**

```bash
pnpm run typecheck
pnpm run lint:check
pnpm run test:ci
```

Expected: each command exits 0. Record exact suite/test counts from `test:ci` for final evidence.

- [ ] **Step 4: 更新 OpenSpec task 4 并提交验证记录（如有文件变化）**

If only `tasks.md` changed:

```bash
git add openspec/changes/refactor-chan-phase-a-time-stack/tasks.md
git commit -m "test(chan): verify phase A and phase B regressions"
```

If a test assertion needed correction, stage that exact test file with `tasks.md`; do not stage production files in this commit.

---

### Task 5: 离线刷新前端快照并检查页面

**Files:**
- Modify: `mist-fe/__fixtures__/snapshots/chan/csi300-2024-2025/bi.json`
- Modify: `mist-fe/__fixtures__/snapshots/chan/csi300-2024-2025/meta.json`
- Modify: `mist-fe/__fixtures__/snapshots/chan/shanghai-index-2024-2025/bi.json`
- Modify: `mist-fe/__fixtures__/snapshots/chan/shanghai-index-2024-2025/meta.json`
- Modify: `mist-fe/__fixtures__/snapshots/chan/chinext-2024-2025/bi.json`
- Modify: `mist-fe/__fixtures__/snapshots/chan/chinext-2024-2025/meta.json`
- Modify: `mist-fe/__fixtures__/snapshots/chan/maotai-2024-2025/bi.json`
- Modify: `mist-fe/__fixtures__/snapshots/chan/maotai-2024-2025/meta.json`
- Modify: `mist-fe/app/chan-tests/lib/__tests__/shanghai-phase-fixture.test.ts`
- Modify: backend `openspec/changes/refactor-chan-phase-a-time-stack/tasks.md`

**Interfaces:**
- Consumes: `tools/export-chan-bi-phases.cjs` and committed `merge-k.json`; no remote backend.
- Produces: phase-aware frontend fixtures with expected counts CSI 31/31, Shanghai 35/25, ChiNext 27/21, Moutai 34/30.

- [ ] **Step 1: 使用本地 merge-k 离线生成四组 bi/meta**

Run from `/Users/moyui/sean/mist/mist-fe`:

```bash
pnpm run snapshots:generate -- --bi-from-merge-k --case=csi300-2024-2025
pnpm run snapshots:generate -- --bi-from-merge-k --case=shanghai-index-2024-2025
pnpm run snapshots:generate -- --bi-from-merge-k --case=chinext-2024-2025
pnpm run snapshots:generate -- --bi-from-merge-k --case=maotai-2024-2025
```

Expected generator summaries:

```text
csi300-2024-2025: Phase A 31 / Phase B 31
shanghai-index-2024-2025: Phase A 35 / Phase B 25
chinext-2024-2025: Phase A 27 / Phase B 21
maotai-2024-2025: Phase A 34 / Phase B 30
```

Reject generated files if merge-K counts change; `--bi-from-merge-k` is allowed to rewrite only `bi.json` and `meta.json`.

- [ ] **Step 2: 强化上证完整快照前端断言**

Replace `mist-fe/app/chan-tests/lib/__tests__/shanghai-phase-fixture.test.ts` with:

```typescript
import { BiStatus } from '@/app/api/types';
import { readSnapshot } from '../load-snapshot';

it('keeps the full Shanghai Phase A and Phase B regression', () => {
  const snapshot = readSnapshot('shanghai-index-2024-2025');

  expect(snapshot?.meta.stats.phaseABiCount).toBe(35);
  expect(snapshot?.meta.stats.phaseBBiCount).toBe(25);
  expect(snapshot?.bi.phaseA).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        startTime: '2024-10-07T16:00:00.000Z',
        endTime: '2024-10-15T16:00:00.000Z',
        trend: 'down',
        status: BiStatus.Invalid,
      }),
    ]),
  );
  expect(snapshot?.bi.phaseB).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        startTime: '2024-10-07T16:00:00.000Z',
        endTime: '2025-01-12T16:00:00.000Z',
        trend: 'down',
        status: BiStatus.Valid,
      }),
      expect.objectContaining({
        startTime: '2025-05-26T16:00:00.000Z',
        endTime: '2025-08-25T16:00:00.000Z',
        trend: 'up',
        status: BiStatus.Valid,
      }),
    ]),
  );
});
```

- [ ] **Step 3: 运行前端测试与静态检查**

```bash
pnpm run typecheck
pnpm run lint
pnpm run test:ci
```

Expected: all commands exit 0. Do not change chart rendering code to make snapshot tests pass.

- [ ] **Step 4: 使用浏览器检查 `/chan-tests` 四组数据**

Start or reuse the local frontend at `http://localhost:3000/chan-tests`, then use the in-app browser control skill to inspect:

```text
沪深300：Phase A 不再出现 206-302 与内部 valid 重叠
上证指数：Phase A 35 / Phase B 25，可切换并显示两个关键长笔
创业板：Phase A 无 valid 重叠
贵州茅台：Phase A 无 valid 重叠
```

If Phase B still contains a structurally continuous long span, record its indices and dates in evidence; do not modify Phase B in this change.

- [ ] **Step 5: 在前端仓库提交快照刷新**

```bash
git add \
  __fixtures__/snapshots/chan/csi300-2024-2025/bi.json \
  __fixtures__/snapshots/chan/csi300-2024-2025/meta.json \
  __fixtures__/snapshots/chan/shanghai-index-2024-2025/bi.json \
  __fixtures__/snapshots/chan/shanghai-index-2024-2025/meta.json \
  __fixtures__/snapshots/chan/chinext-2024-2025/bi.json \
  __fixtures__/snapshots/chan/chinext-2024-2025/meta.json \
  __fixtures__/snapshots/chan/maotai-2024-2025/bi.json \
  __fixtures__/snapshots/chan/maotai-2024-2025/meta.json \
  app/chan-tests/lib/__tests__/shanghai-phase-fixture.test.ts
git commit -m "test(chan-tests): refresh phase A time-stack snapshots"
```

Then return to the backend repository and mark OpenSpec tasks `5.1` through `5.3` complete.

---

### Task 6: 最终校验、证据和交付

**Files:**
- Create: `openspec/changes/refactor-chan-phase-a-time-stack/evidence.md`
- Modify: `openspec/changes/refactor-chan-phase-a-time-stack/tasks.md`
- Verify: all backend and frontend files listed above.

**Interfaces:**
- Consumes: final backend and frontend commits from Tasks 1-5.
- Produces: strict-valid OpenSpec change with reproducible evidence and all tasks complete.

- [ ] **Step 1: 写 evidence.md 的固定结构并填入实际命令输出**

Create `openspec/changes/refactor-chan-phase-a-time-stack/evidence.md` with these sections and paste the exact observed counts from the completed commands:

```markdown
# Phase A 单时间栈验证证据

## TDD 红灯

- 完整沪深300旧实现：8 对 valid 重叠，包含 206→302 / 222→228。
- 完整上证旧实现：Phase A 47，不满足新基线 35。

## Phase A helper 独立验证

- helper 测试命令及通过数量。
- 输入不可变、连续性错误、连续两次归约的覆盖结果。

## 后端联合验证

- 完整沪深300与上证指数测试结果。
- bi-merge-cases 6/6。
- 聚焦测试、typecheck、lint、test:ci 的退出状态和测试数量。

## 前端与页面验证

- 四组快照 Phase A/Phase B 数量。
- 前端 typecheck、lint、test:ci 结果。
- /chan-tests 四组数据的可视检查结论。
- 仍需后续评估的 Phase B 长笔索引和日期（如有）。
```

Replace each descriptive bullet with the actual command, exit code, suite count, test count, and observed range; do not write “通过” without evidence.

- [ ] **Step 2: 运行最终全量命令**

Backend:

```bash
npx jest --runInBand --watchman=false --testPathPattern="bi-phase-a-real-snapshots|bi-merge-cases"
npx jest --runInBand --watchman=false --testPathPattern="bi-phase-a-time-stack|bi-phase-b-merge|bi.service.spec|channel.service.spec"
pnpm run typecheck
pnpm run lint:check
pnpm run test:ci
openspec validate refactor-chan-phase-a-time-stack --strict
git diff --check
```

Frontend:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test:ci
git diff --check
```

Expected: every command exits 0 and evidence contains the fresh output, not results copied from an earlier turn.

- [ ] **Step 3: 审核范围并完成 OpenSpec tasks**

Run in both repositories:

```bash
git status --short
git diff --stat
```

Confirm no roadmap, BigQMT, archived preview, chart rendering, API, or Phase B helper file is included in this change. Mark all remaining OpenSpec tasks complete only after the matching evidence exists.

- [ ] **Step 4: 提交最终 OpenSpec 证据**

```bash
git add \
  openspec/changes/refactor-chan-phase-a-time-stack/evidence.md \
  openspec/changes/refactor-chan-phase-a-time-stack/tasks.md
git commit -m "docs(openspec): complete phase A time-stack evidence"
```

- [ ] **Step 5: 最终交付说明**

Report:

```text
Phase A helper commit
BiService integration commit
Backend verification suite/test counts
Frontend snapshot commit and four phase counts
OpenSpec strict validation result
Any deferred Phase B long-span evidence
```

Do not archive the OpenSpec change until the user explicitly reviews the `/chan-tests` result and asks to archive it.

---

## Phase C：最终内联迁移（当前执行）

**目标：** 只迁移代码归属。Phase A、Phase B 的归约规则、`{ phaseA, phaseB }` 公共返回、
HTTP/Channel 消费、完整真实快照和 `mist-fe` 已提交快照均不得变化。

### C1. Phase A 内联（独立提交）

1. 将 `bi-phase-a-time-stack.helper.spec.ts` 改名为 `bi.service.phase-a.spec.ts`，保留全部 7 个
   场景；通过 NestJS Test module 构造 `BiService`，以 `jest.spyOn(service as any, ...)` 替代
   operations mock。
2. 先让测试直接调用尚不存在的 `reducePhaseATimeStack(candidates, data)`，确认 RED；再将 helper
   的候选浅克隆、Complete/连续性/外边界不变量、栈顶三笔局部固定点和重新 valid 判定原样内联。
3. 该私有方法 MUST 直接调用 `canMergeThreeBis`、`mergeThreeBis(..., data)`、
   `isCandidateBiValid`；现有 `assertCompleteBi` 的语义不得改变，时间栈专用不变量使用独立名称。
4. `getBi` 改用 `this.reducePhaseATimeStack(candidates, data)`；删除 Phase A import、operations
   接口和 helper 源文件。
5. 运行 `bi.service.phase-a.spec.ts`、`bi-phase-a-real-snapshots.spec.ts`、`bi.service.spec.ts`，勾选
   7.2，提交 `refactor(chan): inline phase A time-stack reduction`。

### C2. Phase B 内联（独立提交）

1. 将 `bi-phase-b-merge.helper.spec.ts` 改名为 `bi.service.phase-b.spec.ts`，保留全部 9 个场景；
   使用 NestJS Test module 和 private-method spies。
2. 先以缺少 `mergeBiSegments(phaseABis, data)` 的直接调用确认 RED；再原样内联最短跨度、同跨度
   最左、Complete 边界、含 Invalid、同向端点、价格包络、两笔严格递进、重新判定与固定点重扫。
3. `isPhaseBMergeableSpan` 与 `mergeBiSegments` MUST 直接调用 `canMergeTwoBis`、
   `mergeTwoBis(..., data)`、`isCandidateBiValid`，不得保留 `PhaseBMergeOperations`。
4. 更新 `bi.service.spec.ts` 的结构断言；删除 Phase B import、operations 接口和 helper 源文件。
5. 运行 `bi.service.phase-b.spec.ts`、`bi-merge-cases.spec.ts`、`bi.service.spec.ts`、
   `channel.service.spec.ts`，勾选 7.3，提交 `refactor(chan): inline phase B segment merge`。

### C3. 最终验证与证据（独立提交）

```bash
npx jest --runInBand --watchman=false --testPathPattern="bi.service.phase-a|bi.service.phase-b"
npx jest --runInBand --watchman=false --testPathPattern="bi-phase-a-real-snapshots|bi-merge-cases|bi.service.spec|channel.service.spec"
pnpm run typecheck
pnpm run lint:check
pnpm run test:ci
openspec validate refactor-chan-phase-a-time-stack --strict
git diff --check
```

在 `mist-fe` 只验证、不得生成快照：`git diff --quiet`、`pnpm run typecheck`、`pnpm run lint`、
`pnpm run test:ci`。记录后端/前端实际 suite 与 test 数、零快照变化、helper 源文件/接口符号
均不存在的检查结果；勾选 7.4，提交 `docs(openspec): complete chan bi consolidation evidence`。
