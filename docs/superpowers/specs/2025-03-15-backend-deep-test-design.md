# 后端深度测试设计文档

**日期**: 2025-03-15
**作者**: Claude Code
**状态**: 设计阶段
**目标**: 对 mist、mcp-server 和缠论算法进行全面的功能验证测试

---

## 1. 概述

### 1.1 测试目标

验证后端服务所有功能正常工作，包括：
- **Mist 应用** (端口 8001)：技术指标计算、Chan Theory 算法、数据获取
- **MCP Server** (端口 8009)：MCP 工具接口
- **Chan Theory 算法**：合并K、笔识别、中枢识别

### 1.2 测试方法

采用**渐进式集成测试**方案，按照数据流向和依赖关系逐层测试。

### 1.3 测试数据

使用 AKTools 实时获取真实市场数据：
- 上证指数 (sh000001)：2024-2025 完整年度数据
- 沪深 300 (sh000300)：2024 Q4 数据
- 中证 500 (sh000905)：2024 Q4 数据

### 1.4 测试报告

生成完整的 HTML 报告 + Markdown 文档 + JSON 结果，统一保存在 `test-results/` 目录。

---

## 2. 测试架构

### 2.1 分层结构

```
┌─────────────────────────────────────────────────────────┐
│                    测试报告层                              │
│           HTML文档 + JSON结果 + 日志文件                   │
└─────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────┐
│                    MCP服务层                               │
│  - chan-mcp工具测试                                       │
│  - data-mcp工具测试                                       │
│  - indicator-mcp工具测试                                 │
└─────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────┐
│                   Chan Theory算法层                        │
│  - K线合并测试                        │
│  - 笔识别测试                        │
│  - 中枢识别测试                     │
│  - 集成测试（多指数真实数据）                                │
└─────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────┐
│                   技术指标层                               │
│  - MACD计算测试                                            │
│  - KDJ计算测试                                             │
│  - RSI计算测试                                             │
└─────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────┐
│                    数据获取层                              │
│  - K线数据获取（上证指数、沪深300等）                        │
│  - 数据完整性验证                                          │
│  - 时区处理验证                                            │
└─────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────┐
│                  基础设施层                                │
│  - MySQL数据库连接                                        │
│  - AKTools数据源连接                                       │
└─────────────────────────────────────────────────────────┘
```

### 2.2 执行顺序

```
环境检查 → 服务启动 → 数据层测试 → 指标层测试 → 算法层测试 → MCP层测试 → 单元测试 → 生成报告 → 清理
```

---

## 3. 目录结构

### 3.1 测试工具目录

```
mist/
├── test-integration/                   # 集成测试工具（新建）
│   └── deep-test/
│       ├── runner.mjs                   # 主测试运行器
│       ├── lib/
│       │   ├── service-manager.mjs      # 服务启动/停止管理
│       │   ├── api-tester.mjs           # API测试执行器
│       │   ├── data-validator.mjs       # 数据验证器
│       │   ├── report-generator.mjs     # 报告生成器
│       │   └── utils.mjs                # 工具函数
│       └── templates/
│           ├── config-template.json     # 测试配置模板
│           └── report-template.html     # HTML报告模板
│
└── test-data/                          # 测试数据和结果
    └── test-results/
        └── 2025-03-15-backend-deep-test/
            ├── config/                  # 测试配置
            ├── raw/                     # 原始测试数据
            ├── processed/               # 处理后的数据
            ├── logs/                    # 日志文件
            ├── reports/                 # 测试报告
            └── coverage/                # 代码覆盖率
```

### 3.2 测试结果目录结构

```
test-results/2025-03-15-backend-deep-test/
├── config/
│   └── test-config.json                 # 测试参数、指数列表
│
├── raw/                                 # 原始测试数据
│   ├── data-layer/
│   │   ├── sh000001-daily-2024.json
│   │   ├── sh000300-30min-2024.json
│   │   └── sh000905-60min-2024.json
│   ├── indicator-layer/
│   │   ├── macd-results.json
│   │   ├── kdj-results.json
│   │   └── rsi-results.json
│   ├── chan-layer/
│   │   ├── merge-k-results.json
│   │   ├── bi-results.json
│   │   └── channel-results.json
│   └── mcp-layer/
│       ├── mcp-tools-response.json
│       └── mcp-execution-log.json
│
├── processed/
│   ├── validation-results.json
│   ├── performance-metrics.json
│   └── error-summary.json
│
├── logs/
│   ├── test-execution.log
│   ├── service-startup.log
│   └── api-calls.log
│
├── reports/
│   ├── summary.md
│   ├── data-layer-report.md
│   ├── indicator-layer-report.md
│   ├── chan-layer-report.md
│   ├── mcp-layer-report.md
│   └── final-report.html
│
└── coverage/
    ├── coverage.json
    ├── lcov.info
    └── html/
```

---

## 4. 测试用例设计

### 4.1 数据层测试用例

#### 测试用例 1: 上证指数日线数据获取

```javascript
{
  name: "上证指数日线数据-2024年",
  endpoint: "/indicator/k",
  method: "POST",
  body: {
    symbol: "sh000001",
    period: "daily",
    startDate: "2024-01-01",
    endDate: "2024-12-31"
  },
  validations: [
    { name: "数据存在", check: "data.length > 0" },
    { name: "字段完整", check: "所有记录包含OHLCV字段" },
    { name: "时间排序", check: "time字段递增" },
    { name: "时区正确", check: "时间转换为Asia/Shanghai" },
    { name: "数据量合理", check: "约245条交易日数据" }
  ]
}
```

#### 测试用例 2: 沪深300分钟级数据

```javascript
{
  name: "沪深300-30分钟-2024Q4",
  endpoint: "/indicator/k",
  body: {
    symbol: "sh000300",
    period: "30min",
    startDate: "2024-10-01",
    endDate: "2024-12-31"
  },
  validations: [/* 同上 */]
}
```

#### 测试用例 3: 中证500多周期数据

```javascript
{
  name: "中证500-60分钟-近期",
  endpoint: "/indicator/k",
  body: {
    symbol: "sh000905",
    period: "60min",
    startDate: "2024-10-01",
    endDate: "2024-12-31"
  },
  validations: [/* 同上 */]
}
```

#### 边界测试

```javascript
// 边界1: 未来日期
{ symbol: "sh000001", startDate: "2025-01-01", endDate: "2025-12-31" }
预期: 返回空数组或合理错误

// 边界2: 错误的symbol
{ symbol: "invalid999", ... }
预期: 返回友好错误提示

// 边界3: 极短时间范围
{ symbol: "sh000001", startDate: "2024-01-01", endDate: "2024-01-01" }
预期: 返回当日数据或空
```

### 4.2 指标层测试用例

#### MACD 测试

```javascript
{
  name: "MACD计算-上证指数2024",
  endpoint: "/indicator/macd",
  body: {
    symbol: "sh000001",
    period: "daily",
    startDate: "2024-01-01",
    endDate: "2024-12-31"
  },
  validations: [
    { name: "MACD线计算", check: "macd字段非NaN且合理" },
    { name: "Signal线计算", check: "signal字段非NaN且合理" },
    { name: "Histogram计算", check: "histogram = macd - signal" },
    { name: "前26个数据为NaN", check: "begIndex之前的值为NaN" }
  ]
}
```

#### KDJ 测试

```javascript
{
  name: "KDJ计算-上证指数2024",
  endpoint: "/indicator/kdj",
  validations: [
    { name: "K线计算", check: "0 <= k <= 100" },
    { name: "D线计算", check: "0 <= d <= 100" },
    { name: "J线计算", check: "J值可能超出0-100范围" },
    { name: "数据平滑", check: "K和D线条平滑" }
  ]
}
```

#### RSI 测试

```javascript
{
  name: "RSI计算-上证指数2024",
  endpoint: "/indicator/rsi",
  validations: [
    { name: "RSI范围", check: "0 <= rsi <= 100" },
    { name: "前14个数据为NaN", check: "begIndex=14" },
    { name: "超买超卖识别", check: "能识别rsi>70和rsi<30" }
  ]
}
```

### 4.3 缠论算法层测试用例

#### 合并K 测试

```javascript
{
  name: "合并K-上证指数2024",
  endpoint: "/chan/merge-k",
  body: {
    k: "<使用数据层获取的真实K线数据>"
  },
  validations: [
    { name: "合并规则", check: "符合包含关系处理规则" },
    { name: "趋势处理", check: "正确处理上升/下降趋势" },
    { name: "方向保持", check: "合并后保持原趋势方向" }
  ]
}
```

#### 笔识别测试

```javascript
{
  name: "笔识别-上证指数2024",
  endpoint: "/chan/bi",
  body: {
    k: "<真实K线数据>"
  },
  validations: [
    { name: "分型识别", check: "正确识别顶分型和底分型" },
    { name: "笔的构成", check: "笔由三个连续分型构成" },
    { name: "笔的方向", check: "顶分型到下一底分型为向下笔" },
    { name: "回滚机制", check: "新笔破坏旧笔时正确回滚" }
  ]
}
```

#### 中枢识别测试

```javascript
{
  name: "中枢识别-上证指数2024",
  endpoint: "/chan/channel",
  body: {
    bi: "<笔数据>"
  },
  validations: [
    { name: "中枢构成", check: "至少3个笔构成中枢" },
    { name: "区间计算", check: "中枢区间为[高3, 低3]" },
    { name: "中枢扩展", check: "新高/新低笔正确扩展中枢" },
    { name: "中枢延伸", check: "笔在中枢内延伸" }
  ]
}
```

### 4.4 MCP层测试用例

#### MCP 工具列表验证

```javascript
{
  name: "MCP工具列表",
  endpoint: "MCP Protocol",
  test: "调用 tools/list",
  validations: [
    { name: "chan-mcp工具", check: "存在缠论相关工具" },
    { name: "data-mcp工具", check: "存在数据获取工具" },
    { name: "indicator-mcp工具", check: "存在技术指标工具" }
  ]
}
```

#### MCP 工具调用测试

```javascript
{
  name: "MCP工具调用-chan_merge_k",
  tool: "chan_merge_k",
  arguments: { k: "<真实K线数据>" },
  validations: [
    { name: "工具响应", check: "返回合并后的K线" },
    { name: "响应格式", check: "符合MCP工具调用格式" }
  ]
}
```

---

## 5. 测试执行流程

### 5.1 主测试流程

```javascript
async function runDeepTest() {
  const timestamp = new Date().toISOString().split('T')[0];
  const testDir = `test-results/${timestamp}-backend-deep-test`;

  // Phase 1: 环境检查
  await phase1_EnvironmentSetup(testDir);

  // Phase 2: 服务启动
  const services = await phase2_StartServices();

  // Phase 3: 数据层测试
  const dataResults = await phase3_TestDataLayer();

  // Phase 4: 指标层测试
  const indicatorResults = await phase4_TestIndicatorLayer(dataResults);

  // Phase 5: 缠论算法层测试
  const chanResults = await phase5_TestChanLayer(dataResults);

  // Phase 6: MCP层测试
  const mcpResults = await phase6_TestMCPLayer();

  // Phase 7: 单元测试和覆盖率
  const coverageResults = await phase7_RunUnitTests();

  // Phase 8: 生成报告
  await phase8_GenerateReport({
    dataResults,
    indicatorResults,
    chanResults,
    mcpResults,
    coverageResults
  }, testDir);

  // Phase 9: 清理
  await phase9_Cleanup(services);

  console.log(`✅ 测试完成！报告: ${testDir}/reports/final-report.html`);
}
```

### 5.2 错误处理和恢复

### 严重问题修复流程

当测试过程中发现严重阻塞流程的问题时，采用以下策略：

```
┌─────────────────────────────────────────────────────────┐
│              测试运行中遇到严重问题                        │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│        1. 暂停测试，保存当前状态和部分结果                   │
│    - 保存已完成测试的JSON结果                              │
│    - 记录失败点和错误信息                                  │
│    - 生成问题报告                                          │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│        2. 创建修复计划文档                                 │
│    - 新建 docs/plans/YYYY-MM-DD-<issue>-fix.md           │
│    - 记录问题描述、根因分析、修复方案                        │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│        3. 执行修复                                        │
│    - 实施修复代码                                          │
│    - 运行相关测试验证                                      │
│    - 提交修复                                             │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│        4. 恢复测试                                        │
│    - 从保存的状态恢复测试                                  │
│    - 跳过已通过的测试                                      │
│    - 继续执行剩余测试                                      │
└─────────────────────────────────────────────────────────┘
```

### 问题分类和处理策略

| 问题级别 | 示例 | 处理策略 |
|---------|------|---------|
| **严重阻塞** | 服务无法启动、数据库连接失败、核心算法返回错误 | 暂停测试 → 创建修复计划 → 修复后恢复 |
| **警告级** | 偶发的超时、部分数据异常、性能较慢 | 记录到警告清单 → 继续测试 → 测试后处理 |
| **信息级** | 代码覆盖率不足、小量数据缺失 | 记录到优化建议 → 继续测试 |

### 代码实现

```javascript
class TestRunner {
  async run() {
    const state = {
      phase: 0,
      services: null,
      results: {},
      checkpoints: []  // 测试检查点
    };

    try {
      state.results = await this.runPhases(state);

    } catch (error) {
      await this.handleTestFailure(error, state);

    } finally {
      await this.finalCleanup();
    }
  }

  async handleTestFailure(error, state) {
    console.error('❌ 测试失败:', error.message);

    // 1. 分析错误严重性
    const severity = this.analyzeErrorSeverity(error);

    if (severity === 'critical') {
      // 严重问题：保存状态并建议修复
      await this.saveCheckpoint(state);
      await this.generateFixPlan(error, state);
      console.log('\n🔧 已生成修复计划文档，请修复后重新运行测试');
      console.log('💡 使用 --resume 参数可以从检查点恢复测试');

    } else {
      // 警告级：记录并继续
      await this.logWarning(error);
    }
  }

  async saveCheckpoint(state) {
    const checkpointPath = `test-results/${timestamp}-checkpoint.json`;
    await fs.writeFile(checkpointPath, JSON.stringify({
      phase: state.phase,
      results: state.results,
      timestamp: new Date().toISOString()
    }, null, 2));
    console.log(`💾 检查点已保存: ${checkpointPath}`);
  }

  async generateFixPlan(error, state) {
    const fixPlanDate = new Date().toISOString().split('T')[0];
    const fixPlanPath = `docs/plans/${fixPlanDate}-test-blocker-fix.md`;

    const fixPlanContent = this.generateFixPlanContent(error, state);
    await fs.writeFile(fixPlanPath, fixPlanContent);

    console.log(`📝 修复计划已生成: ${fixPlanPath}`);
  }

  generateFixPlanContent(error, state) {
    return `# 测试阻塞问题修复计划

**日期**: ${new Date().toISOString()}
**测试阶段**: Phase ${state.phase}
**错误信息**: ${error.message}

## 问题描述
${this.describeError(error)}

## 根因分析
${this.analyzeRootCause(error)}

## 修复方案
1. TODO: 具体修复步骤
2. TODO: 验证方法
3. TODO: 回归测试

## 修复后恢复测试
\`\`\`bash
# 从检查点恢复测试
pnpm run test:deep -- --resume=test-results/${timestamp}-checkpoint.json
\`\`\`
`;
  }
}
```

---

## 6. 测试报告

### 6.1 报告内容结构

#### HTML 报告 (`final-report.html`)

```html
测试报告
├── 测试概览
│   ├── 测试时间
│   ├── 测试环境 (Node版本, 系统信息)
│   ├── 测试范围 (指数品种, 时间范围)
│   └── 总体评分 (通过率)
│
├── 服务状态
│   ├── MySQL状态
│   ├── AKTools状态
│   ├── mist:8001状态
│   └── mcp-server:8009状态
│
├── 分层测试结果
│   │   ├── 测试用例数
│   │   ├── 通过/失败
│   │   ├── 数据样本展示
│   │   └── 性能指标
│   │
│   ├── 指标层
│   │   ├── MACD测试结果
│   │   ├── KDJ测试结果
│   │   └── RSI测试结果
│   │
│   ├── 缠论算法层
│   │   ├── 合并K测试
│   │   ├── 笔识别测试
│   │   └── 中枢识别测试
│   │
│   └── MCP层
│       ├── 工具列表
│       ├── 调用结果
│       └── 响应时间
│
├── 代码覆盖率
│   ├── 总体覆盖率
│   ├── 按模块覆盖率
│   └── 未覆盖代码列表
│
├── 问题清单
│   ├── 严重问题
│   ├── 警告
│   └── 优化建议
│
└── 附录
    ├── 测试数据样本
    ├── API响应示例
    └── 完整日志链接
```

### 6.2 报告生成配置

```javascript
{
  "generateHTML": true,        // 生成HTML报告
  "generateMarkdown": true,    // 生成Markdown报告
  "includeCharts": true,       // 包含图表
  "saveRawData": true,         // 保存原始数据
  "createArchive": true        // 打包成zip
}
```

---

## 7. NPM Scripts 配置

```json
{
  "scripts": {
    "test:deep": "node test-integration/deep-test/runner.mjs",
    "test:deep:watch": "nodemon --watch test-integration --exec 'node test-integration/deep-test/runner.mjs'"
  }
}
```

---

## 8. 清理工作

### 8.1 删除废弃的 scripts 目录

```bash
# 删除废弃的 scripts 目录
rm -rf scripts/convert-results.js
rmdir scripts/
```

### 8.2 原因

- `scripts/convert-results.js` 包含硬编码路径，是旧的一次性脚本
- 其功能已被 `tools/generate-type-definitions.mjs` 替代
- 未在 package.json 中被引用，属于遗留代码

---

## 9. 实施检查清单

- [ ] 创建 `test-integration/deep-test/` 目录结构
- [ ] 删除废弃的 `scripts/` 目录
- [ ] 实现 `service-manager.mjs`
- [ ] 实现 `api-tester.mjs`
- [ ] 实现 `data-validator.mjs`
- [ ] 实现 `report-generator.mjs`
- [ ] 实现 `utils.mjs`
- [ ] 创建 HTML 报告模板
- [ ] 创建测试配置模板
- [ ] 实现主测试运行器 `runner.mjs`
- [ ] 添加 NPM scripts
- [ ] 编写使用文档
- [ ] 运行完整测试
- [ ] 验证报告生成

---

## 10. 后续步骤

1. 完成设计文档审核
2. 调用 `writing-plans` 技能创建详细实施计划
3. 开始实施测试工具
4. 运行测试并生成报告
5. 根据测试结果优化系统
