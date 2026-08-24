# Design: audit-chancore-algorithms

## 审计方法

### 数据获取

通过 backend API `POST /v1/collector/collect` + `GET /v1/bars/query` 获取真实市场数据，
构建 `ChanK[]` 输入 `ChanCore` 静态方法。

### 逐层验证策略

每个算法模块的验证分两步：

1. **统计验证**：运行算法 → 收集输出统计量（数量、比例、极值）→ 与预期范围对比
2. **抽样验证**：选取特定样本 → 手动/半自动计算预期结果 → 与算法输出逐项比对

### 工具

- 用 Node.js 脚本直接调用 `ChanCore` 静态方法（mist 仓已编译，可 `node -e` 或写临时脚本）
- 输出写入 `openspec/changes/audit-chancore-algorithms/evidence/` 目录
- 最终产出 `audit-report.md`，按模块列出判定结论

## 审计重点（基于 AGENTS.md 定论）

| 算法 | 已知定论 | 审计焦点 |
|------|----------|----------|
| 笔 | 宽笔 = 标准新笔；极值 K 间 ≥3 根原始 K | independentCount ≥5、分型不共用K |
| 段 | 特征序列法；第一/第二元素不做包含合并 | 分型判定（71课）、case-2 倒推确认 |
| 笔中枢 | 有方向性几何；zg>zd + 首末笔突破约束 | 前N-1/后N-1分组、约束检查 |
| 段中枢 | 无方向；对称重叠几何 | 无趋势字段、无首末突破约束 |
| 买卖点 | 一类=仅趋势背驰；二类=前置一类点+回抽；三类=严格不回中枢 | 贴边不算（三类严格 >/<） |
| 背驰 | 力度=area+peak双口径严格< | 不等于、无epsilon |

## 不做的事

- 不修改 `ChanCore` 或任何 `internal/*.ts`
- 不修改单测
- 不修改 `algorithmVersion`
- 不创建新的 fixture
