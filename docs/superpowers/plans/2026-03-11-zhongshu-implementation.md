# 笔中枢（Zhongshu）功能重构实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复笔中枢检测算法，将最小笔数从5笔改为3笔，完善测试覆盖

**Architecture:** 重构 ChannelService 核心检测逻辑，保持 API 和数据结构向后兼容，先写测试后实现（TDD）

**Tech Stack:** NestJS, TypeScript, Jest, TypeORM, ECharts (前端验证)

---

## 前置准备

### Task 0: 环境验证

**Files:** N/A

**Step 1: 确认项目结构**

```bash
cd /Users/xiyugao/code/mist/mist
ls -la apps/mist/src/chan/services/
```

Expected output should show:
- `channel.service.ts`
- `k-merge.service.ts`

**Step 2: 检查现有测试**

```bash
pnpm run test:chan --listTests
```

**Step 3: 启动开发服务器（用于前端验证）**

```bash
# Terminal 1 - Backend
pnpm run start:dev:chan

# Terminal 2 - Frontend (另开窗口)
cd ../mist-fe
pnpm dev
```

**Step 4: 验证前端可访问**

打开浏览器访问: `http://localhost:3000/k`

---

## 阶段1: 单元测试先行

### Task 1: 创建单元测试文件结构

**Files:**
- Create: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 创建测试文件骨架**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { BiVo } from '../vo/bi.vo';
import { ChannelLevel, ChannelType } from '../enums/channel.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiType, BiStatus } from '../enums/bi.enum';

describe('ChannelService', () => {
  let service: ChannelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChannelService],
    }).compile();

    service = module.get<ChannelService>(ChannelService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // 测试套件将在后续任务中添加
});
```

**Step 2: 运行测试验证基础结构**

```bash
pnpm run test channel.service.spec.ts
```

Expected: PASS

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "test: create channel service spec file structure"
```

---

### Task 2: 基础功能测试 - 笔数量验证

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 添加笔数量验证测试**

在 `describe('ChannelService', () => { ... })` 内部添加:

```typescript
describe('基础功能 - 笔数量验证', () => {
  it('应返回空数组当笔数量少于3笔', () => {
    // 准备测试数据 - 只有2笔
    const mockBi: BiVo[] = [
      createMockBi(100, 110, TrendDirection.Up),
      createMockBi(110, 105, TrendDirection.Down),
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it('应返回空数组当笔数组为空', () => {
    const result = service.createChannel({ bi: [] });
    expect(result).toEqual([]);
  });

  it('应检测3笔形成的基本中枢', () => {
    // 3笔交替且重叠
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),    // 第1笔: 100→120
      createMockBi(120, 105, TrendDirection.Down),  // 第2笔: 120→105 (与第1笔重叠: 105-120)
      createMockBi(105, 115, TrendDirection.Up),    // 第3笔: 105→115 (与第2笔重叠: 105-115)
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result).toHaveLength(1);
    expect(result[0].zg).toBe(115); // min(120, 120, 115) = 115
    expect(result[0].zd).toBe(105); // max(100, 105, 105) = 105
    expect(result[0].gg).toBe(120); // max(120, 120, 115) = 120
    expect(result[0].dd).toBe(100); // min(100, 105, 105) = 100
    expect(result[0].bis).toHaveLength(3);
  });
});

// 辅助函数
function createMockBi(
  lowest: number,
  highest: number,
  trend: TrendDirection
): BiVo {
  return {
    startTime: new Date(),
    endTime: new Date(),
    lowest,
    highest,
    trend,
    type: BiType.Complete,
    status: BiStatus.Valid,
    independentCount: 3,
    originIds: [1, 2, 3],
    originData: [],
    startFenxing: null,
    endFenxing: null,
  };
}
```

**Step 2: 运行测试（预期失败）**

```bash
pnpm run test channel.service.spec.ts
```

Expected: FAIL - 当前实现需要5笔

**Step 3: 暂不提交，等待实现修复**

---

### Task 3: zg/zd/gg/dd 计算测试

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 添加计算逻辑测试**

```typescript
describe('zg/zd/gg/dd 计算', () => {
  it('应正确计算zg为所有笔highest的最小值', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 130, TrendDirection.Up),    // highest=130
      createMockBi(130, 90, TrendDirection.Down),   // highest=130
      createMockBi(90, 125, TrendDirection.Up),     // highest=125 ← zg
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result[0].zg).toBe(125); // min(130, 130, 125) = 125
  });

  it('应正确计算zd为所有笔lowest的最大值', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 130, TrendDirection.Up),    // lowest=100
      createMockBi(130, 95, TrendDirection.Down),   // lowest=95
      createMockBi(95, 125, TrendDirection.Up),     // lowest=95 ← zd
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result[0].zd).toBe(100); // max(100, 95, 95) = 100
  });

  it('应正确计算gg为所有笔highest的最大值', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 130, TrendDirection.Up),
      createMockBi(130, 90, TrendDirection.Down),
      createMockBi(90, 125, TrendDirection.Up),
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result[0].gg).toBe(130); // max(130, 130, 125) = 130
  });

  it('应正确计算dd为所有笔lowest的最小值', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 130, TrendDirection.Up),
      createMockBi(130, 90, TrendDirection.Down),
      createMockBi(90, 125, TrendDirection.Up),
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result[0].dd).toBe(90); // min(100, 90, 95) = 90
  });

  it('应处理价格相等的情况', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),
      createMockBi(120, 100, TrendDirection.Down),  // zd = zg = 100
      createMockBi(100, 120, TrendDirection.Up),
    ];

    const result = service.createChannel({ bi: mockBi });

    // 边界情况：zd >= zg 时应返回空（无有效重叠）
    expect(result).toHaveLength(0);
  });
});
```

**Step 2: 运行测试验证失败**

```bash
pnpm run test channel.service.spec.ts
```

---

### Task 4: 方向交替验证测试

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 添加方向验证测试**

```typescript
describe('方向交替验证', () => {
  it('应拒绝3笔方向不交替的情况 - 连续上升', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),
      createMockBi(115, 135, TrendDirection.Up),    // 方向错误：连续向上
      createMockBi(130, 150, TrendDirection.Up),    // 方向错误：连续向上
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result).toHaveLength(0); // 不应形成中枢
  });

  it('应拒绝3笔方向不交替的情况 - 连续下降', () => {
    const mockBi: BiVo[] = [
      createMockBi(150, 130, TrendDirection.Down),
      createMockBi(135, 115, TrendDirection.Down),  // 方向错误
      createMockBi(120, 100, TrendDirection.Down),  // 方向错误
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result).toHaveLength(0);
  });

  it('应接受正确的上-下-上交替', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),
      createMockBi(120, 105, TrendDirection.Down),
      createMockBi(105, 115, TrendDirection.Up),
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result).toHaveLength(1);
  });

  it('应接受正确的下-上-下交替', () => {
    const mockBi: BiVo[] = [
      createMockBi(120, 100, TrendDirection.Down),
      createMockBi(100, 115, TrendDirection.Up),
      createMockBi(115, 105, TrendDirection.Down),
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result).toHaveLength(1);
  });
});
```

**Step 2: 运行测试验证**

```bash
pnpm run test channel.service.spec.ts
```

---

### Task 5: 中枢延伸测试

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 添加延伸逻辑测试**

```typescript
describe('中枢延伸', () => {
  it('应将第4笔添加到中枢（在zg-zd区间内）', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),
      createMockBi(120, 105, TrendDirection.Down),
      createMockBi(105, 115, TrendDirection.Up),
      createMockBi(115, 108, TrendDirection.Down), // 第4笔：在108-115区间，与中枢重叠
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result).toHaveLength(1);
    expect(result[0].bis).toHaveLength(4); // 应包含4笔
  });

  it('应将第5笔添加到中枢（在zg-zd区间内）', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),
      createMockBi(120, 105, TrendDirection.Down),
      createMockBi(105, 115, TrendDirection.Up),
      createMockBi(115, 108, TrendDirection.Down),
      createMockBi(108, 118, TrendDirection.Up), // 第5笔：在108-118区间，仍重叠
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result).toHaveLength(1);
    expect(result[0].bis).toHaveLength(5);
  });

  it('应停止延伸当笔突破zg', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),
      createMockBi(120, 105, TrendDirection.Down),
      createMockBi(105, 115, TrendDirection.Up),
      createMockBi(115, 130, TrendDirection.Up), // 突破zg=115，延伸结束
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result).toHaveLength(1);
    expect(result[0].bis).toHaveLength(3); // 只有前3笔
    expect(result[0].type).toBe(ChannelType.Complete); // 延伸结束
  });

  it('应停止延伸当笔突破zd', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),
      createMockBi(120, 105, TrendDirection.Down),
      createMockBi(105, 115, TrendDirection.Up),
      createMockBi(115, 95, TrendDirection.Down), // 突破zd=105
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result).toHaveLength(1);
    expect(result[0].bis).toHaveLength(3);
  });

  it('应标记为Complete当笔不再重叠', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),
      createMockBi(120, 105, TrendDirection.Down),
      createMockBi(105, 115, TrendDirection.Up),
      createMockBi(115, 90, TrendDirection.Down), // 突破区间，延伸结束
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result[0].type).toBe(ChannelType.Complete);
  });

  it('应标记为UnComplete当仍有后续重叠笔', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),
      createMockBi(120, 105, TrendDirection.Down),
      createMockBi(105, 115, TrendDirection.Up),
      createMockBi(115, 108, TrendDirection.Down), // 仍在区间内
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result[0].type).toBe(ChannelType.UnComplete);
  });
});
```

**Step 2: 运行测试验证**

```bash
pnpm run test channel.service.spec.ts
```

---

### Task 6: 滑动窗口测试

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 添加滑动窗口测试**

```typescript
describe('滑动窗口检测', () => {
  it('应检测所有可能的中枢', () => {
    const mockBi: BiVo[] = [
      // 第一个中枢 (笔0-2)
      createMockBi(100, 120, TrendDirection.Up),
      createMockBi(120, 105, TrendDirection.Down),
      createMockBi(105, 115, TrendDirection.Up),
      createMockBi(115, 90, TrendDirection.Down),   // 突破第一个中枢

      // 第二个中枢 (笔4-6)
      createMockBi(90, 110, TrendDirection.Up),
      createMockBi(110, 95, TrendDirection.Down),
      createMockBi(95, 108, TrendDirection.Up),
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('应处理重叠的中枢（不同起始点）', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),
      createMockBi(120, 105, TrendDirection.Down),
      createMockBi(105, 115, TrendDirection.Up),
      createMockBi(115, 110, TrendDirection.Down),   // 可与笔1-3形成新中枢
      createMockBi(110, 118, TrendDirection.Up),
    ];

    const result = service.createChannel({ bi: mockBi });

    // 应检测到多个可能的中枢
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('应正确跳过无效窗口', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),
      createMockBi(120, 105, TrendDirection.Down),
      createMockBi(105, 115, TrendDirection.Up),
      // 无效窗口：不交替
      createMockBi(115, 130, TrendDirection.Up),
      createMockBi(130, 125, TrendDirection.Up),
      // 有效窗口继续
      createMockBi(125, 135, TrendDirection.Down),
    ];

    const result = service.createChannel({ bi: mockBi });

    // 至少有一个有效中枢
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
```

**Step 2: 运行测试**

```bash
pnpm run test channel.service.spec.ts
```

---

### Task 7: 边界情况测试

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 添加边界情况测试**

```typescript
describe('边界情况', () => {
  it('应处理恰好3笔的情况', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 120, TrendDirection.Up),
      createMockBi(120, 105, TrendDirection.Down),
      createMockBi(105, 115, TrendDirection.Up),
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result).toHaveLength(1);
  });

  it('应处理大量笔（性能测试）', () => {
    const mockBi: BiVo[] = [];
    let price = 100;

    // 生成100笔
    for (let i = 0; i < 100; i++) {
      const isUp = i % 2 === 0;
      const start = price;
      const end = isUp ? price + 20 : price - 15;
      mockBi.push(createMockBi(
        Math.min(start, end),
        Math.max(start, end),
        isUp ? TrendDirection.Up : TrendDirection.Down
      ));
      price = end;
    }

    const startTime = Date.now();
    const result = service.createChannel({ bi: mockBi });
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(100); // 应在100ms内完成
    expect(Array.isArray(result)).toBe(true);
  });

  it('应处理所有笔价格相同', () => {
    const mockBi: BiVo[] = [
      createMockBi(100, 100, TrendDirection.Up),
      createMockBi(100, 100, TrendDirection.Down),
      createMockBi(100, 100, TrendDirection.Up),
    ];

    const result = service.createChannel({ bi: mockBi });

    // zg = zd = 100，无有效重叠
    expect(result).toHaveLength(0);
  });

  it('应处理极端价格值', () => {
    const mockBi: BiVo[] = [
      createMockBi(0.0001, 99999, TrendDirection.Up),
      createMockBi(99999, 0.0001, TrendDirection.Down),
      createMockBi(0.0001, 50000, TrendDirection.Up),
    ];

    const result = service.createChannel({ bi: mockBi });

    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});
```

**Step 2: 运行所有测试**

```bash
pnpm run test channel.service.spec.ts
```

Expected: 多个测试失败（这是预期的，等待实现）

---

## 阶段2: 核心算法实现

### Task 8: 重构 ChannelService - 修改最小笔数

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 修改 getChannel 方法**

将第165-191行的 `getChannel` 方法修改为:

```typescript
/**
 * 获取中枢
 * @param data
 * @returns
 */
private getChannel(data: BiVo[]) {
  // 中枢要至少3笔才能形成（修正：原为5笔）
  const channels: ChannelVo[] = [];
  const biCount = data.length;
  if (biCount < 3) {
    return { channels, offsetIndex: 0 };
  }
  let i = 0;
  for (i; i <= biCount - 3; i++) {  // 修改：原为 biCount - 5
    const threeBis = data.slice(i, i + 3);  // 修改：原为 i + 5
    // 生成严格中枢
    const channel = this.handleStrictChannelState(threeBis);
    // 如果没有找到channel, 尝试下次迭代
    if (!channel) continue;
    // 处理中枢扩展，如果存在后续笔的情况
    if (i + 3 < biCount) {  // 修改：原为 i + 5
      const remainBis = data.slice(i + 3);  // 修改：原为 i + 5
      const { channel: extendedChannel, offsetIndex } =
        this.handleExtendChannelState(channel, remainBis);
      i = i + offsetIndex;
      channels.push(extendedChannel);
    } else {
      channels.push(channel);
    }
  }
  return { channels, offsetIndex: i };
}
```

**Step 2: 运行测试验证进展**

```bash
pnpm run test channel.service.spec.ts
```

Expected: 部分测试通过，基础3笔检测应该工作

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "fix: change zhongshu minimum bi count from 5 to 3"
```

---

### Task 9: 修复 handleStrictChannelState 方法

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 修改 handleStrictChannelState 方法**

将第64-81行修改为:

```typescript
// 处理严格中枢状态
private handleStrictChannelState(bis: BiVo[]): ChannelVo | null {
  if (bis.length < 3) {  // 修改：原为 < 5
    return null;
  }
  // 检查笔的方向是否交替
  if (!this.isTrendAlternating(bis)) {
    return null;
  }
  // 检查前3笔是否重叠
  const overlapRange = this.checkOverlapRange(bis.slice(0, 3));  // 修改：原为 slice(0, 5)
  if (!overlapRange) {
    return null;
  }

  const channel = this.getStrictChannel(bis, overlapRange);
  return channel;
}
```

**Step 2: 修改 getStrictChannel 方法**

将第47-62行修改为:

```typescript
private getStrictChannel(bis: BiVo[], overlapRange: number[]): ChannelVo {
  const resultBis = bis.slice(0, 3);  // 修改：原为 slice(0, 5)
  return {
    zg: overlapRange[0],
    zd: overlapRange[1],
    gg: Math.max(...resultBis.map((bi) => bi.highest)),
    dd: Math.min(...resultBis.map((bi) => bi.lowest)),
    bis: resultBis,
    level: ChannelLevel.Bi,
    type: ChannelType.Complete,
    startId: bis[0].originIds[0],
    endId: bis[bis.length - 1].originIds[bis[bis.length - 1].originIds.length - 1],
    trend: bis[0].trend,
  };
}
```

**Step 3: 运行测试**

```bash
pnpm run test channel.service.spec.ts
```

**Step 4: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "fix: update handleStrictChannelState for 3-bi detection"
```

---

### Task 10: 修复 checkOverlapRange 方法

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 修改 checkOverlapRange 方法**

将第28-45行修改为:

```typescript
private checkOverlapRange(bis: BiVo[]) {
  if (bis.length < 3) {  // 修改：原为 < 5
    return null;
  }
  const highests = bis.map((bi) => bi.highest);
  const lowests = bis.map((bi) => bi.lowest);

  const zg = Math.min(...highests);
  const zd = Math.max(...lowests);
  // 无重叠：zd >= zg 时无有效中枢
  if (zd >= zg) return null;
  const allOverlap = bis.every((bi) =>
    this.hasOverlapWithChannel(bi, zg, zd),
  );
  // 每笔重叠区间
  if (!allOverlap) return null;
  return [zg, zd];
}
```

**Step 2: 运行测试**

```bash
pnpm run test channel.service.spec.ts
```

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "fix: update checkOverlapRange for 3-bi minimum"
```

---

### Task 11: 优化 hasOverlapWithChannel 方法

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 确认 hasOverlapWithChannel 实现**

第24-26行应该保持不变:

```typescript
private hasOverlapWithChannel(bi: BiVo, zg: number, zd: number) {
  return bi.lowest <= zg && bi.highest >= zd;
}
```

这个实现是正确的，使用 `<=` 和 `>=` 允许边界相等。

**Step 2: 运行测试**

```bash
pnpm run test channel.service.spec.ts
```

---

### Task 12: 优化 extendChannel 逻辑

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 检查 handleExtendChannelState 方法**

确认第111-158行的逻辑正确处理延伸。关键点：
- 检查后续笔是否与中枢区间重叠
- 正确标记 Complete vs UnComplete 状态

**Step 2: 如有需要，调整偏移量计算**

确保 `offsetIndex` 计算正确，滑动窗口能正确推进。

**Step 3: 运行测试**

```bash
pnpm run test channel.service.spec.ts
```

**Step 4: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "refactor: optimize channel extension logic"
```

---

### Task 13: 添加输入验证

**Files:**
- Modify: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 在 createChannel 方法开头添加验证**

```typescript
createChannel(createChannelDto: CreateChannelDto): ChannelVo[] {
  // 输入验证
  this.validateInput(createChannelDto.bi);

  const { channels } = this.getChannel(createChannelDto.bi);
  return channels;
}

private validateInput(bis: BiVo[]): void {
  if (!bis || bis.length === 0) {
    return; // 空数组是合法的，返回空结果
  }

  for (const bi of bis) {
    if (!bi.highest || !bi.lowest) {
      throw new BadRequestException('Invalid Bi data: missing highest/lowest');
    }
    if (bi.highest < bi.lowest) {
      throw new BadRequestException('Invalid Bi data: highest < lowest');
    }
  }
}
```

**Step 2: 运行测试**

```bash
pnpm run test channel.service.spec.ts
```

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "feat: add input validation to channel service"
```

---

## 阶段3: 集成测试

### Task 14: 创建集成测试文件

**Files:**
- Create: `apps/mist/src/chan/test/zhongshu.integration.spec.ts`

**Step 1: 创建集成测试骨架**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ChannelService } from '../services/channel.service';
import { BiVo } from '../vo/bi.vo';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiType, BiStatus } from '../enums/bi.enum';

describe('Zhongshu Integration Tests', () => {
  let service: ChannelService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChannelService],
    }).compile();

    service = module.get<ChannelService>(ChannelService);
  });

  describe('标准模式测试', () => {
    it('应检测标准3笔上升中枢', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 120, TrendDirection.Up),
        createMockBi(120, 105, TrendDirection.Down),
        createMockBi(105, 115, TrendDirection.Up),
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(1);
      expect(result[0].trend).toBe(TrendDirection.Up);
      expect(result[0].zg).toBeLessThan(result[0].zd);
    });

    it('应检测标准3笔下降中枢', () => {
      const mockBi: BiVo[] = [
        createMockBi(120, 100, TrendDirection.Down),
        createMockBi(100, 115, TrendDirection.Up),
        createMockBi(115, 105, TrendDirection.Down),
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(1);
      expect(result[0].trend).toBe(TrendDirection.Down);
    });

    it('应检测延伸5笔的中枢', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 120, TrendDirection.Up),
        createMockBi(120, 105, TrendDirection.Down),
        createMockBi(105, 115, TrendDirection.Up),
        createMockBi(115, 108, TrendDirection.Down),
        createMockBi(108, 118, TrendDirection.Up),
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(1);
      expect(result[0].bis).toHaveLength(5);
    });

    it('应检测延伸7笔的中枢', () => {
      const mockBi: BiVo[] = createExtendedZhongshu(7);
      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(1);
      expect(result[0].bis.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('真实数据场景', () => {
    it('应处理上证指数模拟数据', () => {
      // 模拟上证指数的典型走势
      const mockBi = createShanghaiIndexPattern();
      const result = service.createChannel({ bi: mockBi });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // 辅助函数
  function createMockBi(lowest: number, highest: number, trend: TrendDirection): BiVo {
    return {
      startTime: new Date(),
      endTime: new Date(),
      lowest,
      highest,
      trend,
      type: BiType.Complete,
      status: BiStatus.Valid,
      independentCount: 3,
      originIds: [1, 2, 3],
      originData: [],
      startFenxing: null,
      endFenxing: null,
    };
  }

  function createExtendedZhongshu(count: number): BiVo[] {
    const bis: BiVo[] = [];
    let base = 100;
    for (let i = 0; i < count; i++) {
      const isUp = i % 2 === 0;
      const low = base;
      const high = isUp ? base + 20 : base - 5;
      bis.push(createMockBi(
        Math.min(low, high),
        Math.max(low, high),
        isUp ? TrendDirection.Up : TrendDirection.Down
      ));
      base = isUp ? high - 10 : low + 10;
    }
    return bis;
  }

  function createShanghaiIndexPattern(): BiVo[] {
    // 模拟上证指数的典型波动模式
    return [
      createMockBi(3000, 3050, TrendDirection.Up),
      createMockBi(3050, 3020, TrendDirection.Down),
      createMockBi(3020, 3040, TrendDirection.Up),
      createMockBi(3040, 3010, TrendDirection.Down),
      createMockBi(3010, 3030, TrendDirection.Up),
    ];
  }
});
```

**Step 2: 运行集成测试**

```bash
pnpm run test zhongshu.integration.spec.ts
```

**Step 3: 提交**

```bash
git add apps/mist/src/chan/test/zhongshu.integration.spec.ts
git commit -m "test: add zhongshu integration tests"
```

---

### Task 15: 创建测试数据夹具

**Files:**
- Create: `test-data/fixtures/patterns/zhongshu-3bi-basic.json`
- Create: `test-data/fixtures/patterns/zhongshu-5bi-extend.json`
- Create: `test-data/fixtures/patterns/zhongshu-no-overlap.json`

**Step 1: 创建3笔基础中枢测试数据**

```json
{
  "name": "3笔基础上升中枢",
  "description": "3笔形成标准上升中枢",
  "bis": [
    {
      "startTime": "2024-01-01T00:00:00Z",
      "endTime": "2024-01-02T00:00:00Z",
      "lowest": 100,
      "highest": 120,
      "trend": "up",
      "type": "complete",
      "status": "valid",
      "independentCount": 3
    },
    {
      "startTime": "2024-01-02T00:00:00Z",
      "endTime": "2024-01-03T00:00:00Z",
      "lowest": 105,
      "highest": 120,
      "trend": "down",
      "type": "complete",
      "status": "valid",
      "independentCount": 3
    },
    {
      "startTime": "2024-01-03T00:00:00Z",
      "endTime": "2024-01-04T00:00:00Z",
      "lowest": 105,
      "highest": 115,
      "trend": "up",
      "type": "complete",
      "status": "valid",
      "independentCount": 3
    }
  ],
  "expected": {
    "channelCount": 1,
    "zg": 115,
    "zd": 105,
    "gg": 120,
    "dd": 100,
    "biCount": 3
  }
}
```

**Step 2: 创建5笔延伸中枢测试数据**

```json
{
  "name": "5笔延伸中枢",
  "description": "3笔基础中枢+2笔延伸",
  "bis": [
    {
      "lowest": 100, "highest": 120, "trend": "up",
      "type": "complete", "status": "valid", "independentCount": 3
    },
    {
      "lowest": 105, "highest": 120, "trend": "down",
      "type": "complete", "status": "valid", "independentCount": 3
    },
    {
      "lowest": 105, "highest": 115, "trend": "up",
      "type": "complete", "status": "valid", "independentCount": 3
    },
    {
      "lowest": 108, "highest": 115, "trend": "down",
      "type": "complete", "status": "valid", "independentCount": 3
    },
    {
      "lowest": 108, "highest": 118, "trend": "up",
      "type": "complete", "status": "valid", "independentCount": 3
    }
  ],
  "expected": {
    "channelCount": 1,
    "biCount": 5,
    "type": "uncomplete"
  }
}
```

**Step 3: 创建无重叠测试数据**

```json
{
  "name": "无重叠-应返回空",
  "description": "3笔不重叠，不应形成中枢",
  "bis": [
    {
      "lowest": 100, "highest": 110, "trend": "up",
      "type": "complete", "status": "valid", "independentCount": 3
    },
    {
      "lowest": 90, "highest": 100, "trend": "down",
      "type": "complete", "status": "valid", "independentCount": 3
    },
    {
      "lowest": 110, "highest": 120, "trend": "up",
      "type": "complete", "status": "valid", "independentCount": 3
    }
  ],
  "expected": {
    "channelCount": 0
  }
}
```

**Step 4: 运行测试验证**

```bash
pnpm run test
```

**Step 5: 提交**

```bash
git add test-data/fixtures/patterns/
git commit -m "test: add zhongshu pattern fixtures"
```

---

### Task 16: 扩展现有测试文件

**Files:**
- Modify: `apps/mist/src/chan/test/shanghai-index-2024.spec.ts`

**Step 1: 添加笔中枢测试用例**

在现有测试文件中添加:

```typescript
describe('笔中枢检测', () => {
  it('应从上证指数数据中检测到笔中枢', async () => {
    const kData = await fetchKData('000001', 'daily');
    const mergeK = kMergeService.merge(kData);
    const bi = chanService.createBi({ k: kData, mergeK });

    const channels = channelService.createChannel({ bi });

    expect(channels.length).toBeGreaterThan(0);
    expect(channels[0].zg).toBeDefined();
    expect(channels[0].zd).toBeDefined();
  });

  it('应计算正确的zg/zd值', async () => {
    // 使用特定已知模式验证
    const testBi = createTestPattern();
    const channels = channelService.createChannel({ bi: testBi });

    expect(channels[0].zg).toBeLessThanOrEqual(channels[0].gg);
    expect(channels[0].zd).toBeGreaterThanOrEqual(channels[0].dd);
    expect(channels[0].zd).toBeLessThan(channels[0].zg); // 有重叠
  });
});
```

**Step 2: 运行测试**

```bash
pnpm run test shanghai-index-2024.spec.ts
```

**Step 3: 提交**

```bash
git add apps/mist/src/chan/test/shanghai-index-2024.spec.ts
git commit -m "test: add zhongshu tests to shanghai index spec"
```

---

## 阶段4: 前端验证

### Task 17: 验证前端数据处理

**Files:**
- Modify: `mist-fe/app/components/k-panel/utils/dataProcessor.ts`

**Step 1: 检查 calculateChannelData 函数**

确认第167-226行的 `calculateChannelData` 函数正确处理中枢数据。特别检查:
- zg/zd/gg/dd 映射正确
- startId/endId 索引查找正确
- Bi 数据关联正确

**Step 2: 运行前端测试**

```bash
cd ../mist-fe
pnpm test channel.test
```

**Step 3: 如有需要，修复前端数据处理**

**Step 4: 提交**

```bash
git add app/components/k-panel/utils/dataProcessor.ts
git commit -m "fix: ensure channel data processing compatibility"
```

---

### Task 18: 前端可视化验证

**Files:**
- Modify: `mist-fe/app/components/k-panel/index.tsx` (如需要)

**Step 1: 启动前端和后端**

```bash
# Terminal 1
cd /Users/xiyugao/code/mist/mist
pnpm run start:dev:chan

# Terminal 2
cd /Users/xiyugao/code/mist/mist-fe
pnpm dev
```

**Step 2: 打开浏览器访问**

```
http://localhost:3000/k
```

**Step 3: 验证可视化**

检查:
- ✅ 中枢矩形显示正确（绿色=Complete, 橙色=UnComplete）
- ✅ zg 上沿线显示
- ✅ zd 下沿线显示
- ✅ 透明度正确（15% vs 8%）
- ✅ 与笔的位置关系正确

**Step 4: 如有问题，调整渲染逻辑**

**Step 5: 提交**

```bash
git add app/components/k-panel/
git commit -m "fix: adjust zhongshu visualization"
```

---

## 阶段5: 代码质量与文档

### Task 19: 检查测试覆盖率

**Files:** N/A

**Step 1: 生成测试覆盖率报告**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run test:cov -- channel.service
```

**Step 2: 验证覆盖率达标**

检查输出:
- 语句覆盖率 ≥ 90%
- 分支覆盖率 ≥ 85%
- 函数覆盖率 = 100%

**Step 3: 如未达标，补充测试用例**

---

### Task 20: 性能测试

**Files:** N/A

**Step 1: 运行性能测试**

```bash
pnpm run test channel.service.spec.ts -- --testNamePattern="性能测试"
```

**Step 2: 验证性能指标**

- 100笔检测时间 < 100ms
- 1000笔检测时间 < 1s

**Step 3: 如性能不达标，优化算法**

---

### Task 21: 更新文档

**Files:**
- Modify: `CLAUDE.md` (如有需要)

**Step 1: 更新项目文档**

记录:
- 笔中枢最小笔数变更（5笔 → 3笔）
- 新增测试文件
- API 兼容性说明

**Step 2: 提交文档**

```bash
git add CLAUDE.md
git commit -m "docs: update zhongshu implementation documentation"
```

---

### Task 22: 最终验证与提交

**Files:** N/A

**Step 1: 运行所有测试**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run test
```

Expected: ALL PASS

**Step 2: 代码审查**

检查代码是否符合规范:

```bash
pnpm run lint
```

**Step 3: 格式化代码**

```bash
pnpm run format
```

**Step 4: 同步测试数据到前端**

```bash
pnpm run test:sync
```

**Step 5: 最终提交**

```bash
git add .
git commit -m "feat: complete zhongshu implementation with 3-bi minimum

- Fix: Change minimum bi count from 5 to 3 (Chan Theory standard)
- Add: Comprehensive unit tests for channel service
- Add: Integration tests with real data patterns
- Add: Test fixtures for common patterns
- Test: Ensure frontend visualization compatibility

Closes #[issue-number]"
```

---

## 验收检查清单

完成所有任务后，验证以下项目：

- [ ] 单元测试全部通过
- [ ] 集成测试全部通过
- [ ] 测试覆盖率 ≥ 90%
- [ ] 3笔能形成中枢
- [ ] zg/zd/gg/dd 计算正确
- [ ] 中枢延伸逻辑正确
- [ ] Complete/UnComplete 状态正确
- [ ] 前端可视化正确显示
- [ ] 性能指标达标（100笔 < 100ms）
- [ ] 代码审查通过
- [ ] 文档已更新

---

## 参考资料

- 设计文档: `docs/plans/2026-03-11-zhongshu-design.md`
- 缠中说禅: https://www.chanlun.org/
- 前端文档: `mist-fe/CLAUDE.md`
- 测试数据管理: `CLAUDE.md` 中的 Test Data Management 章节
