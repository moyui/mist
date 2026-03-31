# 笔中枢（Zhongshu）实现设计文档

**日期**: 2026-03-11
**项目**: Mist - 缠论笔中枢功能重构
**方案**: Approach 2 - 基于研究的算法重写

---

## 问题分析

现有代码中发现的问题：

1. **错误的最小笔数要求**: 当前代码要求至少 **5 笔**才能形成中枢，但缠论定义为 **3 笔**
2. **可能存在的计算错误**: zg/zd 值计算需要验证
3. **缺乏测试覆盖**: 无自动化测试验证功能正确性

经分析，**zg/zd 计算逻辑是正确的**：
- `zg = Math.min(...highests)` - 所有笔最高点的最小值 ✓
- `zd = Math.max(...lowests)` - 所有笔最低点的最大值 ✓

主要问题在于最小笔数要求错误。

---

## 缠论笔中枢定义

### 核心规则

根据缠中说禅理论：

1. **最小构成**: 至少 **3 笔** 连续重叠形成中枢
   - 笔的方向必须交替（上→下→上 或 下→上→下）
   - 3笔的价格区间必须有重叠部分

2. **核心参数计算**:
   ```
   zg (中枢上沿) = min(所有笔的最高点)  // 所有笔highest中的最小值
   zd (中枢下沿) = max(所有笔的最低点)  // 所有笔lowest中的最大值
   gg (中枢最高)   = max(所有笔的最高点)
   dd (中枢最低)   = min(所有笔的最低点)

   有效中枢条件: zd < zg (存在重叠区间)
   ```

3. **中枢延伸**:
   - 3笔形成基础中枢后，后续笔继续在zg-zd区间内震荡
   - 5笔、7笔 = 延伸状态（type: UnComplete）
   - 笔突破zg或zd = 中枢结束

4. **中枢状态**:
   - `Complete`: 中枢已结束（后续笔不重叠）
   - `UnComplete`: 中枢延伸中（后续笔仍在区间内）

### 笔数与中枢级别

| 笔数 | 定义 | 说明 |
|:---:|:---|:---|
| **3笔** | **最小构成单位** | 中枢的基础定义 |
| **5笔** | 中枢延伸 | 仍在原中枢区间内震荡 |
| **7笔** | 中枢延伸 | 继续延伸 |
| **9笔** | **中枢升级** | 级别升级（如1分钟→5分钟） |

---

## 架构设计

### 组件架构

```
┌─────────────────────────────────────────────────────────┐
│                   ChanController                         │
│  POST /chan/channel                                     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              ChannelService (Refactored)                │
│  ┌─────────────────────────────────────────────────┐   │
│  │  createChannel(dto)                             │   │
│  │    ├── validateInput()                          │   │
│  │    ├── detectChannels()        ← 核心检测逻辑    │   │
│  │    └── return ChannelVo[]                      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Private Methods:                                       │
│  ├── detectChannelsAt3Bi()       - 3笔中枢检测         │
│  ├── detectChannelsAt5PlusBi()   - 5+笔中枢检测        │
│  ├── extendChannel()             - 中枢延伸逻辑        │
│  ├── calculateChannelMetrics()   - zg/zd/gg/dd计算    │
│  └── determineChannelType()      - 判断完成状态       │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                   ChannelVo                             │
│  { zg, zd, gg, dd, bis, level, type, startId, endId } │
└─────────────────────────────────────────────────────────┘
```

### 核心算法流程

```
输入: BiVo[] (笔数组)
    │
    ▼
┌──────────────────┐
│ 检查笔数量 >= 3  │ ─→ 否 → 返回空数组
└────────┬─────────┘
         │ 是
         ▼
┌──────────────────────────────┐
│ 滑动窗口遍历 (i = 0 to n-3)  │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ 取3笔: bis[i], bis[i+1], bis[i+2]   │
│ 1. 检查方向交替                       │
│ 2. 计算 zg, zd, gg, dd               │
│ 3. 验证重叠 (zd < zg)                │
└────────┬─────────────────────────────┘
         │
         ▼
    ┌────────┐
    │ 有效？  │
    └───┬────┘
        │
   No   │   Yes
   ┌────┴────┐
   │         │
   ▼         ▼
继续下一个  创建中枢
   索引    ┌─────────────────┐
          │ extendChannel()  │
          │ - 尝试添加后续笔 │
          │ - 判断完成状态   │
          └─────────────────┘
```

---

## 数据结构与接口

### 输入/输出接口（保持不变）

#### 输入: CreateChannelDto
```typescript
{
  bi: BiVo[];  // 笔数组
}
```

#### 输出: ChannelVo
```typescript
{
  zg: number;           // 中枢上沿 (min of highests)
  zd: number;           // 中枢下沿 (max of lowests)
  gg: number;           // 中枢最高 (max of highests)
  dd: number;           // 中枢最低 (min of lowests)
  bis: BiVo[];          // 组成中枢的笔
  level: ChannelLevel;  // 'bi' | 'duan'
  type: ChannelType;    // 'complete' | 'uncomplete'
  startId: number;      // 起始K线索引
  endId: number;        // 结束K线索引
  trend: TrendDirection; // 趋势方向
}
```

### 新增辅助类型

```typescript
// 中枢候选（内部使用）
interface ChannelCandidate {
  startIndex: number;    // 起始笔索引
  bis: BiVo[];          // 组成笔
  zg: number;
  zd: number;
  gg: number;
  dd: number;
  trend: TrendDirection;
}

// 中枢扩展结果
interface ChannelExtension {
  channel: ChannelVo;
  consumedBiCount: number;  // 消耗的笔数量
}
```

### 新增方法签名

```typescript
class ChannelService {
  // Public API (保持兼容)
  createChannel(dto: CreateChannelDto): ChannelVo[];

  // 核心检测方法
  private detectChannelsAt3Bi(bis: BiVo[], startIndex: number): ChannelCandidate | null;
  private detectChannelsAt5PlusBi(bis: BiVo[], startIndex: number): ChannelCandidate | null;

  // 延伸逻辑
  private extendChannel(candidate: ChannelCandidate, remainingBis: BiVo[]): ChannelExtension;

  // 工具方法
  private calculateChannelMetrics(bis: BiVo[]): { zg, zd, gg, dd };
  private validateBiAlternation(bis: BiVo[]): boolean;
  private determineChannelType(channel: ChannelVo, hasNextBi: boolean): ChannelType;
}
```

---

## 错误处理与边界情况

### 输入验证

```typescript
private validateInput(bis: BiVo[]): void {
  if (!bis || bis.length === 0) {
    throw new BadRequestException('Bi array is empty');
  }

  if (bis.some(bi => !bi.highest || !bi.lowest)) {
    throw new BadRequestException('Invalid Bi data: missing highest/lowest');
  }

  if (bis.some(bi => bi.highest < bi.lowest)) {
    throw new BadRequestException('Invalid Bi data: highest < lowest');
  }
}
```

### 边界情况处理

| 场景 | 处理方式 |
|------|---------|
| 笔数量 < 3 | 返回空数组（不抛错） |
| 3笔不交替 | 跳过，继续下一个窗口 |
| 3笔无重叠 | 跳过 |
| 价格相等 | 使用 `<=` 和 `>=` 判断重叠 |
| 最后一个中枢未完成 | `type: UnComplete` |
| 单笔同时在多个中枢 | 允许（不同起始点） |

### 算法边界

```typescript
// 价格相等的特殊情况
hasOverlap(bi: BiVo, zg: number, zd: number): boolean {
  // 使用 <= 和 >= 允许边界相等
  return bi.lowest <= zg && bi.highest >= zd;
}

// 严格交替检查（防止连续同向笔）
validateBiAlternation(bis: BiVo[]): boolean {
  for (let i = 0; i < bis.length - 1; i++) {
    if (bis[i].trend === bis[i + 1].trend) {
      return false;
    }
  }
  return true;
}
```

---

## 测试策略

### 单元测试

#### 测试文件
```
mist/apps/mist/src/chan/services/
├── channel.service.ts
└── channel.service.spec.ts          ← 新增
```

#### 测试用例覆盖

```typescript
describe('ChannelService', () => {
  describe('基础功能', () => {
    it('应返回空数组当笔数量少于3笔');
    it('应检测3笔形成的基本中枢');
    it('应拒绝3笔方向不交替的情况');
    it('应拒绝3笔无重叠的情况');
  });

  describe('zg/zd/gg/dd计算', () => {
    it('应正确计算zg为所有笔highest的最小值');
    it('应正确计算zd为所有笔lowest的最大值');
    it('应正确计算gg为所有笔highest的最大值');
    it('应正确计算dd为所有笔lowest的最小值');
    it('应处理价格相等的情况');
  });

  describe('中枢延伸', () => {
    it('应将第4笔添加到中枢（在区间内）');
    it('应将第5笔添加到中枢（在区间内）');
    it('应停止延伸当笔突破zg或zd');
    it('应标记为UnComplete当仍有后续重叠笔');
    it('应标记为Complete当笔不再重叠');
  });

  describe('滑动窗口', () => {
    it('应检测所有可能的中枢');
    it('应处理重叠的中枢（不同起始点）');
    it('应正确跳过无效窗口');
  });

  describe('边界情况', () => {
    it('应处理恰好3笔的情况');
    it('应处理大量笔（100+）');
    it('应处理所有笔价格相同');
    it('应处理极端价格值');
  });
});
```

### 集成测试

#### 测试文件
```
mist/apps/mist/src/chan/test/
├── zhongshu.integration.spec.ts     ← 新增
├── shanghai-index-2024.spec.ts      ← 扩展
└── csi300-2025.spec.ts              ← 扩展
```

#### 集成测试数据

```typescript
describe('Zhongshu Integration Tests', () => {
  describe('上证指数 2024', () => {
    it('应从真实K线数据中检测到笔中枢');
    it('应计算正确的zg/zd值');
    it('应与可视化图表一致');
  });

  describe('沪深300 2025', () => {
    it('应检测5笔延伸中枢');
    it('应正确标记UnComplete状态');
  });

  describe('已知模式测试', () => {
    it('应检测标准3笔上升中枢');
    it('应检测标准3笔下降中枢');
    it('应检测延伸7笔的中枢');
  });
});
```

### 测试数据管理

#### 新增测试夹具
```
mist/test-data/fixtures/patterns/
├── zhongshu-3bi-basic.json       # 3笔基础中枢
├── zhongshu-5bi-extend.json      # 5笔延伸中枢
├── zhongshu-no-overlap.json      # 无重叠（应返回空）
└── zhongshu-complex.json         # 复杂多中枢场景
```

#### 测试结果同步
```bash
# 运行测试并同步到前端
pnpm run test:full
```

### 测试覆盖率目标

| 指标 | 目标 |
|------|------|
| 语句覆盖率 | ≥ 90% |
| 分支覆盖率 | ≥ 85% |
| 函数覆盖率 | 100% |

---

## 实施计划

### 开发阶段

```
阶段1: 核心算法重构 (1-2天)
├── 修改 ChannelService.detectChannels() - 改为3笔检测
├── 实现 detectChannelsAt3Bi()
├── 实现 detectChannelsAt5PlusBi()
├── 重构 extendChannel()
└── 添加输入验证

阶段2: 单元测试 (1天)
├── 创建 channel.service.spec.ts
├── 实现基础功能测试
├── 实现zg/zd计算测试
├── 实现延伸逻辑测试
└── 实现边界情况测试

阶段3: 集成测试 (1天)
├── 创建 zhongshu.integration.spec.ts
├── 添加真实数据测试
├── 添加模式测试数据
└── 验证前端可视化

阶段4: 前端验证与调整 (0.5天)
├── 验证前端数据处理
├── 检查ECharts渲染
├── 调整颜色/样式（如需要）
└── 更新文档

阶段5: 代码审查与合并 (0.5天)
├── 代码审查
├── 文档更新
└── 合并到主分支
```

### 文件变更清单

```
后端:
✏️  mist/apps/mist/src/chan/services/channel.service.ts
📄 mist/apps/mist/src/chan/services/channel.service.spec.ts (新建)
📄 mist/apps/mist/src/chan/test/zhongshu.integration.spec.ts (新建)
📄 mist/test-data/fixtures/patterns/*.json (新建)

前端:
✏️  mist-fe/app/components/k-panel/utils/dataProcessor.ts (如有需要)
📄 mist-fe/app/components/k-panel/__tests__/channel.test.ts (扩展)
```

### 兼容性保证

- **API兼容**: `POST /chan/channel` 接口签名不变
- **数据结构兼容**: `ChannelVo` 结构不变
- **前端兼容**: 前端无需修改（除非现有数据有误）

---

## 验收标准

### 功能验收
- ✅ 3笔能形成中枢（之前5笔）
- ✅ zg/zd/gg/dd计算正确
- ✅ 中枢延伸逻辑正确
- ✅ Complete/UnComplete状态正确

### 质量验收
- ✅ 单元测试覆盖率 ≥ 90%
- ✅ 所有测试用例通过
- ✅ 真实数据验证通过
- ✅ 前端可视化正确显示

### 性能验收
- ✅ 100笔检测时间 < 100ms
- ✅ 1000笔检测时间 < 1s

---

## 参考资料

- [缠中说禅-数学原理](https://www.chanlun.org/)
- [5分钟和30分钟联立进行缠论信号分析](https://blog.csdn.net/weixin_42480337/article/details/155616431)
- [缠论形态 - Sina Blog](https://blog.sina.com.cn/s/blog_71896b5a0102rw8b.html)
- [Chanlun-PRO 更新日志](https://chanlun-pro.readthedocs.io/UPDATE/)
- [CSDN - 缠论插件终极指南](https://blog.csdn.net/gitblog_00494/article/details/155801165)
