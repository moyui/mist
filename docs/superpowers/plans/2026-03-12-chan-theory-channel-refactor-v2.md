# Chan Theory Channel (笔中枢) 重构设计文档 v2

> **重构目标**: 将笔中枢检测从 3-bi 最小值重构为正确的 5-bi 最小值，实现缠论的严格定义

---

## 架构概述

### 核心原则

1. **不修改 BiVo 数据结构**：不在 BiVo 上添加 enteringSegment/leavingSegment 字段
2. **内部计算**：所有进入段/离开段逻辑在 channel.service.ts 内部动态计算
3. **代码风格一致**：遵循 bi.service.ts 的代码风格，使用 DTO 校验，异常处理与 data.service.ts 一致
4. **非贪婪延伸**：采用"尝试-回退"模式，而不是预先计算刺穿笔

---

## 算法设计

### 1. 前置验证

在 `createChannel` 方法开始时进行快速失败检查：

```typescript
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

### 2. 5-bi 中枢形成

使用滑动窗口检测：

**步骤 1**: 遍历所有可能的 5-bi 组合
```typescript
for (let i = 0; i <= bis.length - 5; i++) {
  const fiveBis = bis.slice(i, i + 5);
  const channel = this.detectChannel(fiveBis);
  if (channel) {
    // 尝试延伸
  }
}
```

**步骤 2**: 验证 5-bi 的有效性
- 趋势交替检查：上下上下上 或 下上下上下
- 前 3 笔计算 zg-zd：
  - zg = min(bi1.highest, bi2.highest, bi3.highest)
  - zd = max(bi1.lowest, bi2.lowest, bi3.lowest)
- 必须 zg > zd（有重叠）
- 第 4、5 笔必须与 zg-zd 重叠（lowest ≤ zg && highest ≥ zd）

**步骤 3**: 计算初始极值
- 向上中枢：极值 = max(Bi1.highest, Bi3.highest, Bi5.highest)
- 向下中枢：极值 = min(Bi1.lowest, Bi3.lowest, Bi5.lowest)

### 3. 非贪婪中枢延伸

从第 6 笔开始尝试延伸：

```typescript
private extendChannel(
  channel: ChannelVo,
  remainingBis: BiVo[],
): { channel: ChannelVo; usedCount: number } {

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
    return {
      channel: this.rebuildChannel(channel, extendedBis),
      usedCount: extendedBis.length
    };
  }

  return { channel, usedCount: 0 };
}
```

**极值比较逻辑**：
- 向上笔：`highest > currentExtreme` → 超过
- 向下笔：`lowest < currentExtreme` → 超过

**回退机制**：
当奇数笔未超过极值时，立即停止延伸，不加入该奇数笔和之前的偶数笔。

### 4. 中枢无重叠

检测到多个中枢后，处理重叠：

```typescript
private mergeOverlappingChannels(channels: ChannelVo[]): ChannelVo[] {
  const result: ChannelVo[] = [];

  for (const current of channels) {
    const overlapIndex = result.findIndex(existing =>
      this.hasTimeOverlap(existing, current)
    );

    if (overlapIndex === -1) {
      result.push(current);
    } else {
      // 保留笔数较少的（更精确）
      if (current.bis.length < result[overlapIndex].bis.length) {
        result[overlapIndex] = current;
      }
    }
  }

  return result;
}
```

---

## 数据结构

### 不修改 BiVo

BiVo 保持不变，不添加任何新字段。

### ChannelVo（保持不变）

```typescript
export class ChannelVo {
  bis: BiVo[];
  zg: number;
  zd: number;
  gg: number;
  dd: number;
  level: ChannelLevel;
  type: ChannelType;
  startId: number;
  endId: number;
  trend: TrendDirection;
}
```

### DTO（保持简单）

```typescript
export class CreateChannelDto {
  @IsNotEmpty({
    message: '笔数据不能为空',
  })
  bi: BiVo[];
}
```

---

## 代码风格

### 与 bi.service.ts 保持一致

1. **中文注释**：注释使用中文
2. **方法命名**：清晰描述功能
3. **辅助方法**：分离逻辑，提高可读性
4. **参数校验**：通过 DTO 实现，不在 service 层重复

### 异常处理（与 data.service.ts 一致）

使用 NestJS 的 `HttpException`：

```typescript
import { HttpException, HttpStatus } from '@nestjs/common';

throw new HttpException(
  `第 ${i + 1} 笔数据不完整：缺少分型信息`,
  HttpStatus.BAD_REQUEST
);
```

---

## 边界情况处理

### 1. 输入数据不足

```typescript
if (bis.length < 5) {
  return []; // 不足 5 笔，无法形成中枢
}
```

### 2. 未完成笔

最后一笔可以是未完成笔（`endFenxing === null`），正常处理。

### 3. 没有重叠

如果前 3 笔无法形成 zg-zd 重叠（zg ≤ zd），该 5-bi 组合不形成中枢。

### 4. 延伸失败

奇数笔未超过极值时，回退到延伸前的状态。

---

## 测试策略

### 单元测试

1. **前置验证测试**
   - 完整笔通过验证
   - 残缺笔抛异常
   - 最后一笔未完成通过验证

2. **5-bi 形成测试**
   - 有效的 5-bi 中枢
   - 趋势不交替（失败）
   - 前 3 笔无重叠（失败）
   - 第 4 或 5 笔无重叠（失败）

3. **延伸逻辑测试**
   - 偶数笔无条件延伸
   - 奇数笔超过极值延伸
   - 奇数笔未超过极值回退
   - 中间出现无重叠（停止延伸）

4. **重叠处理测试**
   - 无重叠中枢全部保留
   - 有重叠保留笔数少的

### 集成测试

使用上证指数 2024-2025 数据验证：
- 至少 5 笔才能形成中枢
- 延伸逻辑正确执行
- 中枢无重叠

---

## 性能考虑

### 时间复杂度

- 滑动窗口：O(n × k)，n 为笔数量，k 为平均中枢笔数
- 重叠合并：O(m²)，m 为检测到的中枢数量
- 总体：O(n × k + m²)

### 优化

- 延伸失败后，跳过已使用的笔，减少重复计算
- 使用索引而不是复制数组

---

## 迁移计划

### 阶段 1：前置验证和 5-bi 形成
1. 添加 `validateBiIntegrity` 方法
2. 重写 `detectChannel` 为 5-bi 最小值
3. 更新测试

### 阶段 2：非贪婪延伸
1. 实现 `extendChannel` 方法
2. 实现极值比较逻辑
3. 更新测试

### 阶段 3：重叠处理
1. 实现 `mergeOverlappingChannels` 方法
2. 验证最终结果
3. 集成测试

---

## 成功标准

1. ✅ 所有中枢至少有 5 笔
2. ✅ 奇数笔延伸正确执行极值比较
3. ✅ 延伸失败时正确回退
4. ✅ 最终中枢无时间重叠
5. ✅ 残缺笔抛出异常
6. ✅ 代码风格与 bi.service.ts 一致
7. ✅ 异常处理与 data.service.ts 一致
8. ✅ 测试覆盖率 > 90%
