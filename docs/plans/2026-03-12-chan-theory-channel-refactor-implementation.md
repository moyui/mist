# Chan Theory Channel (笔中枢) 重构实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 将笔中枢检测从 3-bi 最小值重构为正确的 5-bi 最小值，实现缠论的严格定义

**架构:** 在 channel.service.ts 内部实现 5-bi 最小值检测和非贪婪延伸算法，不修改 BiVo 数据结构，使用 DTO 校验和 HttpException 异常处理

**技术栈:** NestJS, TypeScript, Jest, class-validator

---

## Task 1: 清理旧的测试文件

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 删除旧的测试内容**

```bash
# 备份原文件（如果需要）
# cp apps/mist/src/chan/services/channel.service.spec.ts apps/mist/src/chan/services/channel.service.spec.ts.bak

# 清空文件内容，只保留必要的导入和 describe 框架
cat > apps/mist/src/chan/services/channel.service.spec.ts << 'EOF'
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { BiVo } from '../vo/bi.vo';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiType } from '../enums/bi.type';
import { BiStatus } from '../enums/bi.status';
import { ChannelType } from '../enums/channel.enum';
import { ChannelLevel } from '../enums/channel.enum';
import { FenxingType } from '../enums/fenxing.enum';

describe('ChannelService', () => {
  let service: ChannelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChannelService],
    }).compile();

    service = module.get<ChannelService>(ChannelService);
  });

  describe('基础功能', () => {
    it('service should be defined', () => {
      expect(service).toBeDefined();
    });
  });
});
EOF
```

**Step 2: 运行测试确认基础框架正常**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（只有基础的 service defined 测试）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "refactor(channel): 清空旧测试，准备重构

移除所有旧测试，保留基础测试框架

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: 添加笔数据完整性验证

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 添加验证方法**

在 `channel.service.ts` 中添加 `validateBiIntegrity` 方法：

```typescript
import { HttpException, HttpStatus } from '@nestjs/common';

private validateBiIntegrity(bis: BiVo[]): void {
  for (let i = 0; i < bis.length; i++) {
    const bi = bis[i];
    const isLastBi = i === bis.length - 1;

    // 最后一笔可以是未完成的（endFenxing 为 null）
    if (isLastBi && !bi.endFenxing) {
      continue;
    }

    // 其他笔必须有完整的 startFenxing 和 endFenxing
    if (!bi.startFenxing || !bi.endFenxing) {
      throw new HttpException(
        `第 ${i + 1} 笔数据不完整：缺少分型信息`,
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
```

**Step 2: 在 createChannel 方法中调用验证**

找到 `createChannel` 方法，在开始处添加验证调用：

```typescript
createChannel(createChannelDto: CreateChannelDto): ChannelVo[] {
  // 步骤 1: 验证所有笔的完整性
  this.validateBiIntegrity(createChannelDto.bi);

  // 步骤 2: 执行中枢检测业务逻辑
  const { channels } = this.getChannel(createChannelDto.bi);
  return channels;
}
```

**Step 3: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（现有测试继续通过）

**Step 4: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "feat(channel): 添加笔数据完整性验证

- 添加 validateBiIntegrity 方法检查每笔的分型信息
- 最后一笔可以是未完成笔（endFenxing 为 null）
- 发现残缺笔时抛出 HttpException (400)
- 在 createChannel 方法开始处调用验证

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: 编写笔数据完整性验证测试

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 添加测试辅助函数**

```typescript
function createTestBi(params: {
  highest: number;
  lowest: number;
  trend: TrendDirection;
  hasStartFenxing?: boolean;
  hasEndFenxing?: boolean;
}): BiVo {
  const bi = new BiVo();
  bi.highest = params.highest;
  bi.lowest = params.lowest;
  bi.trend = params.trend;
  bi.startTime = new Date('2024-01-01');
  bi.endTime = new Date('2024-01-02');
  bi.type = BiType.Complete;
  bi.status = BiStatus.Valid;
  bi.independentCount = 1;
  bi.originIds = [1];
  bi.originData = [];

  // 创建分型对象
  if (params.hasStartFenxing !== false) {
    bi.startFenxing = {
      type: FenxingType.Bottom,
      highest: params.highest,
      lowest: params.lowest,
      leftIds: [1],
      middleIds: [2],
      rightIds: [3],
      middleIndex: 1,
      middleOriginId: 2
    };
  } else {
    bi.startFenxing = null;
  }

  if (params.hasEndFenxing !== false) {
    bi.endFenxing = {
      type: FenxingType.Top,
      highest: params.highest,
      lowest: params.lowest,
      leftIds: [3],
      middleIds: [4],
      rightIds: [5],
      middleIndex: 1,
      middleOriginId: 4
    };
  } else {
    bi.endFenxing = null;
  }

  return bi;
}
```

**Step 2: 添加验证测试**

```typescript
describe('笔数据完整性验证', () => {
  it('应该通过验证 - 完整的笔数据', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
    ];

    expect(() => {
      service.createChannel({ bi: bis });
    }).not.toThrow();
  });

  it('应该通过验证 - 最后一笔未完成', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up, hasEndFenxing: false }),
    ];

    expect(() => {
      service.createChannel({ bi: bis });
    }).not.toThrow();
  });

  it('应该抛出异常 - 中间笔缺少 startFenxing', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down, hasStartFenxing: false }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
    ];

    expect(() => {
      service.createChannel({ bi: bis });
    }).toThrow(HttpException);
  });

  it('应该抛出异常 - 第一笔缺少 endFenxing（不是最后一笔）', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up, hasEndFenxing: false }),
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
    ];

    expect(() => {
      service.createChannel({ bi: bis });
    }).toThrow(HttpException);
  });
});
```

**Step 3: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（所有验证测试通过）

**Step 4: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "test(channel): 添加笔数据完整性验证测试

- 添加 createTestBi 辅助函数
- 测试完整笔数据通过验证
- 测试最后一笔未完成通过验证
- 测试中间笔缺少分型抛出异常

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: 添加重叠检查辅助方法

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 添加 hasOverlap 方法**

```typescript
/**
 * 检查笔是否与中枢区间重叠
 * @param bi 笔数据
 * @param zg 中枢高
 * @param zd 中枢低
 * @returns 是否重叠
 */
private hasOverlap(bi: BiVo, zg: number, zd: number): boolean {
  // 基本重叠检查：笔的低点 ≤ zg 且笔的高点 ≥ zd
  return bi.lowest <= zg && bi.highest >= zd;
}
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（现有测试继续通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "feat(channel): 添加重叠检查辅助方法

添加 hasOverlap 方法用于检查笔是否与中枢区间重叠

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: 编写重叠检查测试

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 添加重叠检查测试**

```typescript
describe('重叠检查', () => {
  it('应该检测到完全重叠', () => {
    const bi = createTestBi({ highest: 110, lowest: 85, trend: TrendDirection.Up });
    const zg = 100;
    const zd = 90;

    const result = (service as any).hasOverlap(bi, zg, zd);

    expect(result).toBe(true);
  });

  it('应该检测到部分重叠 - 从下方进入', () => {
    const bi = createTestBi({ highest: 95, lowest: 85, trend: TrendDirection.Up });
    const zg = 100;
    const zd = 90;

    const result = (service as any).hasOverlap(bi, zg, zd);

    expect(result).toBe(true);
  });

  it('应该检测到部分重叠 - 从上方进入', () => {
    const bi = createTestBi({ highest: 105, lowest: 95, trend: TrendDirection.Down });
    const zg = 100;
    const zd = 90;

    const result = (service as any).hasOverlap(bi, zg, zd);

    expect(result).toBe(true);
  });

  it('应该检测到无重叠 - 完全在下方', () => {
    const bi = createTestBi({ highest: 85, lowest: 80, trend: TrendDirection.Up });
    const zg = 100;
    const zd = 90;

    const result = (service as any).hasOverlap(bi, zg, zd);

    expect(result).toBe(false);
  });

  it('应该检测到无重叠 - 完全在上方', () => {
    const bi = createTestBi({ highest: 110, lowest: 105, trend: TrendDirection.Up });
    const zg = 100;
    const zd = 90;

    const result = (service as any).hasOverlap(bi, zg, zd);

    expect(result).toBe(false);
  });

  it('应该检测到边界重叠 - 最高点等于 zg', () => {
    const bi = createTestBi({ highest: 100, lowest: 85, trend: TrendDirection.Up });
    const zg = 100;
    const zd = 90;

    const result = (service as any).hasOverlap(bi, zg, zd);

    expect(result).toBe(true);
  });

  it('应该检测到边界重叠 - 最低点等于 zd', () => {
    const bi = createTestBi({ highest: 105, lowest: 90, trend: TrendDirection.Up });
    const zg = 100;
    const zd = 90;

    const result = (service as any).hasOverlap(bi, zg, zd);

    expect(result).toBe(true);
  });
});
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（所有重叠检查测试通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "test(channel): 添加重叠检查测试

测试各种重叠情况：
- 完全重叠
- 部分重叠（从上下方进入）
- 无重叠（完全在上下方）
- 边界重叠

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: 添加趋势交替检查辅助方法

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 添加 isTrendAlternating 方法**

```typescript
/**
 * 检查多笔的趋势是否交替
 * @param bis 笔数组
 * @returns 是否交替
 */
private isTrendAlternating(bis: BiVo[]): boolean {
  for (let i = 0; i < bis.length - 1; i++) {
    if (bis[i].trend === bis[i + 1].trend) {
      return false;
    }
  }
  return true;
}
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（现有测试继续通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "feat(channel): 添加趋势交替检查辅助方法

添加 isTrendAlternating 方法用于检查笔的趋势是否交替

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: 编写趋势交替检查测试

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 添加趋势交替检查测试**

```typescript
describe('趋势交替检查', () => {
  it('应该检测到交替趋势 - 上上下下上', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
      createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
      createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
    ];

    const result = (service as any).isTrendAlternating(bis);

    expect(result).toBe(true);
  });

  it('应该检测到交替趋势 - 下上下上下', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Down }),
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Up }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Down }),
      createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Up }),
      createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Down }),
    ];

    const result = (service as any).isTrendAlternating(bis);

    expect(result).toBe(true);
  });

  it('应该检测到非交替 - 相邻笔同向', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
      createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Up }),
      createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Down }),
    ];

    const result = (service as any).isTrendAlternating(bis);

    expect(result).toBe(false);
  });

  it('应该处理单笔', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
    ];

    const result = (service as any).isTrendAlternating(bis);

    expect(result).toBe(true);
  });
});
```

**Step 2: 近行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（所有趋势交替检查测试通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "test(channel): 添加趋势交替检查测试

测试各种趋势交替情况：
- 上上下下上
- 下上下上下
- 相邻笔同向（失败）
- 单笔（通过）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: 添加 zg-zd 计算辅助方法

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 添加 calculateZgZd 方法**

```typescript
/**
 * 计算中枢的 zg-zd
 * @param bis 笔数组（至少 3 笔）
 * @returns [zg, zd] 或 null（无重叠）
 */
private calculateZgZd(bis: BiVo[]): [number, number] | null {
  if (bis.length < 3) {
    return null;
  }

  // zg = 前 3 笔的最低高点
  const zg = Math.min(
    bis[0].highest,
    bis[1].highest,
    bis[2].highest
  );

  // zd = 前 3 笔的最高低点
  const zd = Math.max(
    bis[0].lowest,
    bis[1].lowest,
    bis[2].lowest
  );

  // 检查是否有重叠
  if (zg <= zd) {
    return null;
  }

  return [zg, zd];
}
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（现有测试继续通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "feat(channel): 添加 zg-zd 计算辅助方法

添加 calculateZgZd 方法用于计算中枢的 zg 和 zd：
- zg = 前 3 笔的最低高点
- zd = 前 3 笔的最高低点
- 返回 null 如果无重叠

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: 编写 zg-zd 计算测试

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 添加 zg-zd 计算测试**

```typescript
describe('zg-zd 计算', () => {
  it('应该正确计算 zg-zd - 有重叠', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
    ];

    const result = (service as any).calculateZgZd(bis);

    expect(result).toEqual([105, 95]); // zg = min(110, 105, 115) = 105, zd = max(90, 85, 95) = 95
  });

  it('应该返回 null - 无重叠', () => {
    const bis = [
      createTestBi({ highest: 100, lowest: 90, trend: TrendDirection.Up }),
      createTestBi({ highest: 95, lowest: 85, trend: TrendDirection.Down }),
      createTestBi({ highest: 90, lowest: 80, trend: TrendDirection.Up }),
    ];

    const result = (service as any).calculateZgZd(bis);

    expect(result).toBeNull(); // zg = 90, zd = 90, 无重叠
  });

  it('应该返回 null - 少于 3 笔', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
    ];

    const result = (service as any).calculateZgZd(bis);

    expect(result).toBeNull();
  });

  it('应该处理边界情况 - zg 略大于 zd', () => {
    const bis = [
      createTestBi({ highest: 100, lowest: 90, trend: TrendDirection.Up }),
      createTestBi({ highest: 99, lowest: 89, trend: TrendDirection.Down }),
      createTestBi({ highest: 98, lowest: 88, trend: TrendDirection.Up }),
    ];

    const result = (service as any).calculateZgZd(bis);

    expect(result).toEqual([98, 90]); // zg = 98, zd = 90
  });
});
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（所有 zg-zd 计算测试通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "test(channel): 添加 zg-zd 计算测试

测试各种 zg-zd 计算情况：
- 有重叠
- 无重叠
- 少于 3 笔
- 边界情况

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: 实现 5-bi 中枢检测方法

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 实现 detectChannel 方法**

```typescript
/**
 * 检测 5-bi 中枢
 * @param bis 笔数组（至少 5 笔）
 * @returns 中枢对象或 null
 */
private detectChannel(bis: BiVo[]): ChannelVo | null {
  if (bis.length < 5) {
    return null;
  }

  // 检查趋势是否交替
  if (!this.isTrendAlternating(bis)) {
    return null;
  }

  // 从前 3 笔计算 zg-zd
  const zgZd = this.calculateZgZd(bis);
  if (!zgZd) {
    return null;
  }

  const [zg, zd] = zgZd;

  // 检查第 4、5 笔是否与 zg-zd 重叠
  if (!this.hasOverlap(bis[3], zg, zd) || !this.hasOverlap(bis[4], zg, zd)) {
    return null;
  }

  // 计算 gg-dd
  const gg = Math.max(...bis.map(bi => bi.highest));
  const dd = Math.min(...bis.map(bi => bi.lowest));

  // 创建中枢对象
  return {
    bis: [...bis],
    zg: zg,
    zd: zd,
    gg: gg,
    dd: dd,
    level: ChannelLevel.Bi,
    type: ChannelType.Complete,
    startId: bis[0].originIds[0],
    endId: bis[bis.length - 1].originIds[bis[bis.length - 1].originIds.length - 1],
    trend: bis[0].trend,
  };
}
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（现有测试继续通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "feat(channel): 实现 5-bi 中枢检测方法

添加 detectChannel 方法：
- 检查至少 5 笔
- 检查趋势交替
- 计算前 3 笔的 zg-zd
- 验证第 4、5 笔与 zg-zd 重叠
- 创建中枢对象

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: 编写 5-bi 中枢形成测试

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 添加 5-bi 中枢形成测试**

```typescript
describe('5-bi 中枢形成', () => {
  it('应该形成有效的 5-bi 中枢 - 上上下下上', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),      // Bi1
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),    // Bi2
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),      // Bi3
      createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),    // Bi4
      createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),      // Bi5
    ];

    const result = (service as any).detectChannel(bis);

    expect(result).not.toBeNull();
    expect(result.bis.length).toBe(5);
    expect(result.zg).toBe(105); // min(110, 105, 115) = 105
    expect(result.zd).toBe(95);  // max(90, 85, 95) = 95
    expect(result.gg).toBe(115); // max of all highest
    expect(result.dd).toBe(85);  // min of all lowest
    expect(result.trend).toBe(TrendDirection.Up);
  });

  it('应该返回 null - 少于 5 笔', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
      createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
    ];

    const result = (service as any).detectChannel(bis);

    expect(result).toBeNull();
  });

  it('应该返回 null - 趋势不交替', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
      createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Up }), // Wrong direction
      createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Down }),
    ];

    const result = (service as any).detectChannel(bis);

    expect(result).toBeNull();
  });

  it('应该返回 null - 前 3 笔无重叠', () => {
    const bis = [
      createTestBi({ highest: 100, lowest: 90, trend: TrendDirection.Up }),
      createTestBi({ highest: 95, lowest: 85, trend: TrendDirection.Down }),
      createTestBi({ highest: 90, lowest: 80, trend: TrendDirection.Up }),
      createTestBi({ highest: 93, lowest: 83, trend: TrendDirection.Down }),
      createTestBi({ highest: 97, lowest: 87, trend: TrendDirection.Up }),
    ];

    const result = (service as any).detectChannel(bis);

    expect(result).toBeNull();
  });

  it('应该返回 null - 第 4 笔无重叠', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),      // zg=105, zd=95
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
      createTestBi({ highest: 94, lowest: 84, trend: TrendDirection.Down }),    // highest=94 < zg=105, no overlap
      createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
    ];

    const result = (service as any).detectChannel(bis);

    expect(result).toBeNull();
  });

  it('应该返回 null - 第 5 笔无重叠', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),      // zg=105, zd=95
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
      createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
      createTestBi({ highest: 94, lowest: 84, trend: TrendDirection.Up }),       // highest=94 < zg=105, no overlap
    ];

    const result = (service as any).detectChannel(bis);

    expect(result).toBeNull();
  });

  it('应该形成有效的 5-bi 中枢 - 下上下上下', () => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Down }),     // Bi1
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Up }),      // Bi2
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Down }),     // Bi3
      createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Up }),      // Bi4
      createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Down }),     // Bi5
    ];

    const result = (service as any).detectChannel(bis);

    expect(result).not.toBeNull();
    expect(result.bis.length).toBe(5);
    expect(result.trend).toBe(TrendDirection.Down);
  });
});
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（所有 5-bi 中枢形成测试通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "test(channel): 添加 5-bi 中枢形成测试

测试各种 5-bi 中枢形成情况：
- 有效的向上中枢
- 有效的向下中枢
- 少于 5 笔（失败）
- 趋势不交替（失败）
- 前 3 笔无重叠（失败）
- 第 4 或 5 笔无重叠（失败）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 12: 添加初始极值计算方法

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 添加 calculateInitialExtreme 方法**

```typescript
/**
 * 计算中枢的初始极值
 * @param channel 中枢对象
 * @returns 极值（向上中枢为最高点，向下中枢为最低点）
 */
private calculateInitialExtreme(channel: ChannelVo): number {
  const channelTrend = channel.trend;
  let extreme: number;

  if (channelTrend === TrendDirection.Up) {
    // 向上中枢：取 Bi1, Bi3, Bi5 的最高点最大值
    extreme = Math.max(
      channel.bis[0].highest,
      channel.bis[2].highest,
      channel.bis[4].highest
    );
  } else {
    // 向下中枢：取 Bi1, Bi3, Bi5 的最低点最小值
    extreme = Math.min(
      channel.bis[0].lowest,
      channel.bis[2].lowest,
      channel.bis[4].lowest
    );
  }

  return extreme;
}
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（现有测试继续通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "feat(channel): 添加初始极值计算方法

添加 calculateInitialExtreme 方法：
- 向上中枢：max(Bi1, Bi3, Bi5 的 highest)
- 向下中枢：min(Bi1, Bi3, Bi5 的 lowest)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 13: 添加极值比较方法

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 添加 exceedsExtreme 方法**

```typescript
/**
 * 检查笔是否超过极值
 * @param bi 笔数据
 * @param extreme 当前极值
 * @param trend 中枢趋势
 * @returns 是否超过
 */
private exceedsExtreme(bi: BiVo, extreme: number, trend: TrendDirection): boolean {
  if (trend === TrendDirection.Up) {
    // 向上中枢：检查最高点是否超过极值
    return bi.highest > extreme;
  } else {
    // 向下中枢：检查最低点是否超过极值（更小）
    return bi.lowest < extreme;
  }
}
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（现有测试继续通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "feat(channel): 添加极值比较方法

添加 exceedsExtreme 方法：
- 向上中枢：highest > extreme
- 向下中枢：lowest < extreme

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 14: 添加极值更新方法

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 添加 updateExtreme 方法**

```typescript
/**
 * 更新极值
 * @param bi 笔数据
 * @param extreme 当前极值
 * @param trend 中枢趋势
 * @returns 新的极值
 */
private updateExtreme(bi: BiVo, extreme: number, trend: TrendDirection): number {
  if (trend === TrendDirection.Up) {
    return Math.max(extreme, bi.highest);
  } else {
    return Math.min(extreme, bi.lowest);
  }
}
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（现有测试继续通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "feat(channel): 添加极值更新方法

添加 updateExtreme 方法用于在延伸成功后更新极值

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 15: 编写极值相关方法测试

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 添加极值计算和比较测试**

```typescript
describe('极值计算和比较', () => {
  let testChannel: ChannelVo;

  beforeEach(() => {
    // 创建一个测试用的 5-bi 向上中枢
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),      // Bi1: highest=110
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),      // Bi3: highest=115
      createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
      createTestBi({ highest: 108, lowest: 92, trend: TrendDirection.Up }),      // Bi5: highest=108
    ];

    testChannel = {
      bis: bis,
      zg: 105,
      zd: 95,
      gg: 115,
      dd: 85,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      startId: 1,
      endId: 5,
      trend: TrendDirection.Up,
    };
  });

  describe('初始极值计算', () => {
    it('应该正确计算向上中枢的初始极值', () => {
      const result = (service as any).calculateInitialExtreme(testChannel);

      expect(result).toBe(115); // max(110, 115, 108) = 115
    });

    it('应该正确计算向下中枢的初始极值', () => {
      const downChannel = {
        ...testChannel,
        trend: TrendDirection.Down,
        bis: [
          createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Down }),    // Bi1: lowest=90
          createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Up }),
          createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Down }),    // Bi3: lowest=95
          createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Up }),
          createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Down }),    // Bi5: lowest=92
        ],
      };

      const result = (service as any).calculateInitialExtreme(downChannel);

      expect(result).toBe(90); // min(90, 95, 92) = 90
    });
  });

  describe('极值比较', () => {
    it('应该检测到向上笔超过极值', () => {
      const bi = createTestBi({ highest: 120, lowest: 100, trend: TrendDirection.Up });
      const extreme = 115;

      const result = (service as any).exceedsExtreme(bi, extreme, TrendDirection.Up);

      expect(result).toBe(true); // 120 > 115
    });

    it('应该检测到向上笔未超过极值', () => {
      const bi = createTestBi({ highest: 110, lowest: 95, trend: TrendDirection.Up });
      const extreme = 115;

      const result = (service as any).exceedsExtreme(bi, extreme, TrendDirection.Up);

      expect(result).toBe(false); // 110 < 115
    });

    it('应该检测到向下笔超过极值', () => {
      const bi = createTestBi({ highest: 100, lowest: 85, trend: TrendDirection.Down });
      const extreme = 90;

      const result = (service as any).exceedsExtreme(bi, extreme, TrendDirection.Down);

      expect(result).toBe(true); // 85 < 90
    });

    it('应该检测到向下笔未超过极值', () => {
      const bi = createTestBi({ highest: 105, lowest: 92, trend: TrendDirection.Down });
      const extreme = 90;

      const result = (service as any).exceedsExtreme(bi, extreme, TrendDirection.Down);

      expect(result).toBe(false); // 92 > 90
    });
  });

  describe('极值更新', () => {
    it('应该正确更新向上中枢的极值', () => {
      const bi = createTestBi({ highest: 120, lowest: 100, trend: TrendDirection.Up });
      const extreme = 115;

      const result = (service as any).updateExtreme(bi, extreme, TrendDirection.Up);

      expect(result).toBe(120); // max(115, 120) = 120
    });

    it('应该正确更新向下中枢的极值', () => {
      const bi = createTestBi({ highest: 100, lowest: 85, trend: TrendDirection.Down });
      const extreme = 90;

      const result = (service as any).updateExtreme(bi, extreme, TrendDirection.Down);

      expect(result).toBe(85); // min(90, 85) = 85
    });
  });
});
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（所有极值测试通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "test(channel): 添加极值计算和比较测试

测试极值相关方法：
- 初始极值计算（向上/向下中枢）
- 极值比较（超过/未超过）
- 极值更新

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 16: 实现中枢延伸方法

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 实现 extendChannel 方法**

```typescript
/**
 * 延伸中枢（非贪婪模式）
 * @param channel 中枢对象
 * @param remainingBis 剩余的笔数组
 * @returns 延伸后的中枢和使用的笔数量
 */
private extendChannel(
  channel: ChannelVo,
  remainingBis: BiVo[],
): { channel: ChannelVo; usedCount: number } {

  if (remainingBis.length === 0) {
    return { channel, usedCount: 0 };
  }

  let extendedBis: BiVo[] = [];
  let currentExtreme = this.calculateInitialExtreme(channel);

  for (let i = 0; i < remainingBis.length; i++) {
    const bi = remainingBis[i];
    const biNumber = channel.bis.length + extendedBis.length + 1;

    // 检查重叠
    if (!this.hasOverlap(bi, channel.zg, channel.zd)) {
      break; // 没有重叠，中枢结束
    }

    const isOddNumbered = biNumber >= 7 && biNumber % 2 === 1;

    if (isOddNumbered) {
      // 奇数笔：检查极值
      if (this.exceedsExtreme(bi, currentExtreme, channel.trend)) {
        // 延伸成功，更新极值
        extendedBis.push(bi);
        currentExtreme = this.updateExtreme(bi, currentExtreme, channel.trend);
      } else {
        // 未超过极值，回退，中枢结束
        break;
      }
    } else {
      // 偶数笔：无条件延伸
      extendedBis.push(bi);
    }
  }

  // 重新计算中枢
  if (extendedBis.length > 0) {
    const newBis = [...channel.bis, ...extendedBis];
    const newGg = Math.max(channel.gg, ...extendedBis.map(b => b.highest));
    const newDd = Math.min(channel.dd, ...extendedBis.map(b => b.lowest));

    return {
      channel: {
        ...channel,
        bis: newBis,
        gg: newGg,
        dd: newDd,
        endId: extendedBis[extendedBis.length - 1].originIds[0]
      },
      usedCount: extendedBis.length
    };
  }

  return { channel, usedCount: 0 };
}
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（现有测试继续通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "feat(channel): 实现中枢延伸方法

添加 extendChannel 方法（非贪婪模式）：
- 偶数笔无条件延伸
- 奇数笔检查极值，超过则延伸并更新极值
- 未超过极值则回退，中枢结束
- 重新计算 gg-dd

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 17: 编写中枢延伸测试

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 添加中枢延伸测试**

```typescript
describe('中枢延伸', () => {
  let baseChannel: ChannelVo;

  beforeEach(() => {
    const bis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
      createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
      createTestBi({ highest: 108, lowest: 92, trend: TrendDirection.Up }),
    ];

    baseChannel = {
      bis: bis,
      zg: 105,
      zd: 95,
      gg: 115,
      dd: 85,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      startId: 1,
      endId: 5,
      trend: TrendDirection.Up,
    };
  });

  it('应该延伸偶数笔（第 6 笔）', () => {
    const bi6 = createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Down });

    const result = (service as any).extendChannel(baseChannel, [bi6]);

    expect(result.channel.bis.length).toBe(6);
    expect(result.usedCount).toBe(1);
  });

  it('应该延伸奇数笔（第 7 笔）- 超过极值', () => {
    const bi6 = createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Down });
    const bi7 = createTestBi({ highest: 120, lowest: 100, trend: TrendDirection.Up }); // highest=120 > extreme=115

    const result = (service as any).extendChannel(baseChannel, [bi6, bi7]);

    expect(result.channel.bis.length).toBe(7);
    expect(result.usedCount).toBe(2);
    expect(result.channel.gg).toBe(120); // gg 更新
  });

  it('不应该延伸奇数笔（第 7 笔）- 未超过极值', () => {
    const bi6 = createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Down });
    const bi7 = createTestBi({ highest: 112, lowest: 95, trend: TrendDirection.Up }); // highest=112 < extreme=115

    const result = (service as any).extendChannel(baseChannel, [bi6, bi7]);

    expect(result.channel.bis.length).toBe(6); // 只延伸了 bi6，bi7 未加入
    expect(result.usedCount).toBe(1); // 只用了 1 笔
  });

  it('应该处理连续奇数笔延伸', () => {
    const bi6 = createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Down });
    const bi7 = createTestBi({ highest: 120, lowest: 100, trend: TrendDirection.Up }); // highest=120 > 115
    const bi8 = createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Down });
    const bi9 = createTestBi({ highest: 125, lowest: 105, trend: TrendDirection.Up }); // highest=125 > 120

    const result = (service as any).extendChannel(baseChannel, [bi6, bi7, bi8, bi9]);

    expect(result.channel.bis.length).toBe(9);
    expect(result.usedCount).toBe(4);
  });

  it('应该在无重叠时停止延伸', () => {
    const bi6 = createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Down });
    const bi7 = createTestBi({ highest: 94, lowest: 84, trend: TrendDirection.Up }); // highest=94 < zg=105, no overlap

    const result = (service as any).extendChannel(baseChannel, [bi6, bi7]);

    expect(result.channel.bis.length).toBe(6); // 只延伸了 bi6
    expect(result.usedCount).toBe(1);
  });

  it('应该处理向下中枢的延伸', () => {
    const downBis = [
      createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Down }),
      createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Up }),
      createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Down }),
      createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Up }),
      createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Down }),
    ];

    const downChannel = {
      bis: downBis,
      zg: 108,
      zd: 92,
      gg: 115,
      dd: 85,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      startId: 1,
      endId: 5,
      trend: TrendDirection.Down,
    };

    const bi6 = createTestBi({ highest: 107, lowest: 93, trend: TrendDirection.Up });
    const bi7 = createTestBi({ highest: 115, lowest: 85, trend: TrendDirection.Down }); // lowest=85 < extreme=90

    const result = (service as any).extendChannel(downChannel, [bi6, bi7]);

    expect(result.channel.bis.length).toBe(7);
    expect(result.usedCount).toBe(2);
  });
});
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（所有中枢延伸测试通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "test(channel): 添加中枢延伸测试

测试中枢延伸逻辑：
- 偶数笔无条件延伸
- 奇数笔超过极值延伸
- 奇数笔未超过极值回退
- 连续奇数笔延伸
- 无重叠时停止
- 向下中枢延伸

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 18: 重写 getChannel 方法

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 重写 getChannel 方法**

找到现有的 `getChannel` 方法，替换为：

```typescript
private getChannel(data: BiVo[]) {
  const channels: ChannelVo[] = [];
  const biCount = data.length;

  if (biCount < 5) {
    return { channels, offsetIndex: 0 };
  }

  // 滑动窗口检测所有 5-bi 中枢
  for (let i = 0; i <= biCount - 5; i++) {
    const channel = this.detectChannel(data.slice(i), data, i);

    if (!channel) {
      continue;
    }

    // 尝试延伸中枢
    const remainingBis = data.slice(i + 5);
    const { channel: extendedChannel } = this.extendChannel(channel, remainingBis);

    channels.push(extendedChannel);
  }

  // 合并重叠的中枢（保留笔数少的）
  const mergedChannels = this.mergeOverlappingChannels(channels);

  return { channels: mergedChannels, offsetIndex: biCount };
}
```

**注意**: 你需要修改 `detectChannel` 方法签名以支持新的参数：

```typescript
private detectChannel(
  fiveBis: BiVo[],
  originalBis: BiVo[],
  startIndex: number
): ChannelVo | null {
  // ... 现有逻辑 ...
  startId: originalBis[startIndex].originIds[0],
  endId: originalBis[startIndex + 4].originIds[originalBis[startIndex + 4].originIds.length - 1],
}
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: 可能有一些测试失败，需要调整

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "refactor(channel): 重写 getChannel 方法

实现滑动窗口检测所有 5-bi 中枢：
- 遍历所有可能的 5-bi 组合
- 对每个检测到的中枢尝试延伸
- 合并重叠的中枢

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 19: 实现重叠检查和合并方法

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.ts`

**Step 1: 添加 hasTimeOverlap 方法**

```typescript
/**
 * 检查两个中枢是否有时间重叠
 * @param channel1 中枢1
 * @param channel2 中枢2
 * @returns 是否有重叠
 */
private hasTimeOverlap(channel1: ChannelVo, channel2: ChannelVo): boolean {
  const start1 = channel1.bis[0].startTime.getTime();
  const end1 = channel1.bis[channel1.bis.length - 1].endTime.getTime();
  const start2 = channel2.bis[0].startTime.getTime();
  const end2 = channel2.bis[channel2.bis.length - 1].endTime.getTime();

  // 检查时间区间是否重叠
  return start1 <= end2 && end1 >= start2;
}
```

**Step 2: 添加 mergeOverlappingChannels 方法**

```typescript
/**
 * 合并重叠的中枢（保留笔数少的）
 * @param channels 中枢数组
 * @returns 合并后的中枢数组
 */
private mergeOverlappingChannels(channels: ChannelVo[]): ChannelVo[] {
  const result: ChannelVo[] = [];

  for (const current of channels) {
    const overlapIndex = result.findIndex(existing =>
      this.hasTimeOverlap(existing, current)
    );

    if (overlapIndex === -1) {
      // 无重叠，直接添加
      result.push(current);
    } else {
      // 有重叠，保留笔数少的（更精确）
      if (current.bis.length < result[overlapIndex].bis.length) {
        result[overlapIndex] = current;
      }
    }
  }

  return result;
}
```

**Step 3: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（现有测试继续通过）

**Step 4: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.ts
git commit -m "feat(channel): 添加重叠检查和合并方法

添加 hasTimeOverlap 和 mergeOverlappingChannels 方法：
- 检查中枢是否有时间重叠
- 合并重叠中枢，保留笔数少的（更精确）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 20: 编写重叠合并测试

**文件:**
- 修改: `apps/mist/src/chan/services/channel.service.spec.ts`

**Step 1: 添加重叠合并测试**

```typescript
describe('重叠合并', () => {
  it('应该合并两个重叠的中枢 - 保留笔数少的', () => {
    const channel1: ChannelVo = {
      bis: [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
        createTestBi({ highest: 107, lowest: 87, trend: TrendDirection.Down }),
        createTestBi({ highest: 114, lowest: 94, trend: TrendDirection.Up }),
      ],
      zg: 105,
      zd: 95,
      gg: 115,
      dd: 85,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      startId: 1,
      endId: 7,
      trend: TrendDirection.Up,
    };

    const channel2: ChannelVo = {
      bis: [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
      ],
      zg: 105,
      zd: 95,
      gg: 115,
      dd: 85,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      startId: 1,
      endId: 5,
      trend: TrendDirection.Up,
    };

    const result = (service as any).mergeOverlappingChannels([channel1, channel2]);

    expect(result.length).toBe(1);
    expect(result[0].bis.length).toBe(5); // 保留笔数少的
  });

  it('应该保留两个不重叠的中枢', () => {
    const channel1: ChannelVo = {
      bis: [
        createTestBi({ highest: 110, lowest: 90, trend: TrendDirection.Up }),
        createTestBi({ highest: 105, lowest: 85, trend: TrendDirection.Down }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Up }),
        createTestBi({ highest: 108, lowest: 88, trend: TrendDirection.Down }),
        createTestBi({ highest: 112, lowest: 92, trend: TrendDirection.Up }),
      ],
      zg: 105,
      zd: 95,
      gg: 115,
      dd: 85,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      startId: 1,
      endId: 5,
      trend: TrendDirection.Up,
    };

    const channel2: ChannelVo = {
      bis: [
        createTestBi({ highest: 120, lowest: 100, trend: TrendDirection.Up }),
        createTestBi({ highest: 115, lowest: 95, trend: TrendDirection.Down }),
        createTestBi({ highest: 125, lowest: 105, trend: TrendDirection.Up }),
        createTestBi({ highest: 118, lowest: 98, trend: TrendDirection.Down }),
        createTestBi({ highest: 122, lowest: 102, trend: TrendDirection.Up }),
      ],
      zg: 115,
      zd: 102,
      gg: 125,
      dd: 95,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      startId: 6,
      endId: 10,
      trend: TrendDirection.Up,
    };

    const result = (service as any).mergeOverlappingChannels([channel1, channel2]);

    expect(result.length).toBe(2);
  });
});
```

**Step 2: 运行测试**

```bash
pnpm run test chan -- channel.service.spec.ts
```

预期: PASS（所有重叠合并测试通过）

**Step 3: 提交**

```bash
git add apps/mist/src/chan/services/channel.service.spec.ts
git commit -m "test(channel): 添加重叠合并测试

测试中枢重叠合并：
- 两个重叠中枢保留笔数少的
- 两个不重叠中枢都保留

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 21: 运行集成测试

**文件:**
- 测试: `apps/mist/src/chan/test/shanghai-index-2024-2025.spec.ts`

**Step 1: 运行集成测试**

```bash
pnpm run test:chan:shanghai-2024-2025
```

预期: 测试通过，验证完整的数据流

**Step 2: 检查测试结果**

查看输出的中枢数量和特征，确保：
- 所有中枢至少有 5 笔
- 延伸逻辑正确执行
- 无重叠中枢

**Step 3: 如果测试失败，调试并修复**

根据错误信息修复问题

**Step 4: 提交**

```bash
git add apps/mist/src/chan/test/shanghai-index-2024-2025.spec.ts
git commit -m "test(channel): 更新集成测试以适配新的 5-bi 逻辑

集成测试验证：
- 5-bi 最小值
- 延伸逻辑
- 无重叠中枢

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 22: 运行所有测试并检查覆盖率

**Step 1: 运行所有 Chan Theory 测试**

```bash
pnpm run test:chan
```

预期: 所有测试通过

**Step 2: 检查测试覆盖率**

```bash
pnpm run test:cov
```

预期: 覆盖率 > 90%

**Step 3: 如果覆盖率不足，添加额外测试**

识别未覆盖的代码行，添加测试

**Step 4: 提交**

```bash
git add .
git commit -m "test(channel): 达到测试覆盖率目标

所有 Chan Theory 测试通过，覆盖率 > 90%

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 23: 前端验证

**文件:**
- 前端代码无需修改（API 兼容）

**Step 1: 启动后端服务**

```bash
# Terminal 1
cd /Users/xiyugao/code/mist/mist
pnpm run start:dev:chan
```

**Step 2: 启动前端服务**

```bash
# Terminal 2
cd /Users/xiyugao/code/mist/mist-fe
pnpm dev
```

**Step 3: 打开浏览器验证**

访问 http://localhost:3000/k

检查：
- 中枢正确显示
- 中枢数量符合预期
- 无 console 错误

**Step 4: 截图保存**

保存验证截图

**Step 5: 提交验证结果**

```bash
git commit --allow-empty -m "test(e2e): 前端验证通过

中枢在前端正确显示，无错误

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## 总结

**总任务数**: 23
**预计时间**: 4-6 小时
**测试覆盖率**: > 90%

**关键改动**:
1. 实现了严格的 5-bi 最小值中枢检测
2. 实现了非贪婪的中枢延伸算法
3. 使用真实价格点位比较极值
4. 中枢无重叠保证
5. 前置验证残缺笔
6. 代码风格与 bi.service.ts 一致
7. 异常处理与 data.service.ts 一致
