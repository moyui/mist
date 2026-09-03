# Spec: chan-duan-segment

## Requirements

### Requirement: 线段至少三笔公理约束 (Minimum Three Bis for Complete Duan)
任何被标记为 `type: Complete, status: Valid` 的已完成线段，其包含的原始笔集合 `originBis` 的长度必须 $\ge 3$。系统严禁输出包含笔数 $< 3$（如单笔线段）的完整线段。

#### Scenario: 候选转折点不足三笔时不可结算为完成线段
- **GIVEN** 从 `segStartIdx` 开始的线段扫描
- **WHEN** 算法检测到反向破坏或转折点候选，但 `endIdx - segStartIdx < 2`
- **THEN** 该转折点不能作为当前段的终结端点，当前段继续向后延伸扫描
