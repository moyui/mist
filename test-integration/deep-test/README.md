# 后端深度测试工具

## 简介

渐进式集成测试工具，通过真实市场数据验证 Mist 后端服务的所有功能。

## 测试范围

- **数据层**: K线数据获取、数据完整性验证
- **指标层**: MACD、KDJ、RSI 技术指标计算
- **算法层**: 缠论算法（合并K、笔识别、中枢识别）
- **MCP层**: MCP 工具接口（可选）

## 前置要求

1. MySQL 服务运行中
2. mist-datasource 服务运行中（TDX 数据源）
3. Node.js 18+ 和 pnpm

## 使用方法

### 快速开始

```bash
# 运行完整测试
pnpm run test:deep

# 监听模式（开发时使用）
pnpm run test:deep:watch
```

### 测试配置

编辑 `test-integration/deep-test/runner.mjs` 中的 `TEST_CONFIG` 变量来自定义测试参数：

```javascript
const TEST_CONFIG = {
  indices: [
    {
      symbol: 'sh000001',      // 指数代码
      name: '上证指数',
      period: 'daily',         // 数据周期
      startDate: '2024-01-01',
      endDate: '2024-12-31'
    }
  ],
  tests: {
    dataLayer: true,
    indicatorLayer: true,
    chanLayer: true,
    mcpLayer: false
  }
};
```

### 查看报告

测试完成后，报告会保存在 `test-results/<date>-backend-deep-test/reports/final-report.html`

最新测试结果快捷方式：`test-results/latest/reports/final-report.html`

## 测试流程

```
环境检查 → 服务启动 → 数据层测试 → 指标层测试 → 算法层测试 → 生成报告 → 清理
```

## 故障排除

### 端口被占用

如果 8001 或 8009 端口被占用，测试会自动检测并提示。请先停止占用这些端口的进程。

### MySQL 连接失败

确保 MySQL 服务正在运行：

```bash
# macOS
brew services start mysql

# Linux
sudo systemctl start mysql
```

## 目录结构

```
test-integration/deep-test/
├── runner.mjs              # 主测试运行器
├── lib/
│   ├── service-manager.mjs # 服务管理
│   ├── api-tester.mjs      # API测试
│   ├── data-validator.mjs  # 数据验证
│   ├── report-generator.mjs # 报告生成
│   └── utils.mjs           # 工具函数
└── templates/
    ├── config-template.json
    └── report-template.html
```
