# Mist MCP Server

Mist MCP Server 是一个基于 Model Context Protocol (MCP) 的服务器，将 Mist 股票分析系统的核心功能暴露为 MCP tools，供 AI Agent（如 AstrBot）调用。

**默认端口**: 8009 (可通过环境变量 `MCP_SERVER_PORT` 配置)

## 功能特性

### 1. 缠论分析 (Chan Theory)
- `merge_k` - 合并K线，基于包含关系和趋势方向将连续K线分组
- `create_bi` - 从K线数据中识别笔（Bi），基于缠论分型识别
- `get_fenxing` - 获取所有分型（Fenxing），识别顶分型和底分型
- `create_channel` - 从笔（Bi）数据中识别中枢（Channel/Zhongshu）
- `analyze_chan_theory` - 完整的缠论分析（合并K → 笔 → 分型 → 中枢）

### 2. 技术指标 (Technical Indicators)
- `calculate_macd` - 计算MACD指标（移动平均收敛发散）
- `calculate_rsi` - 计算RSI指标（相对强弱指数）
- `calculate_kdj` - 计算KDJ指标（随机振荡器）
- `calculate_adx` - 计算ADX指标（平均趋向指数）
- `calculate_atr` - 计算ATR指标（平均真实波幅）
- `analyze_indicators` - 完整的技术指标分析

### 3. 数据查询 (Data Query)
- `get_index_info` - 根据代码获取指数信息
- `get_kline_data` - 获取K线数据（分时数据）
- `get_daily_kline` - 获取日线K线数据
- `list_indices` - 获取所有可用的指数列表
- `get_latest_data` - 获取指数的最新数据（所有周期）

### 4. 定时任务 (Scheduled Tasks)
- `trigger_data_collection` - 触发数据采集任务
- `list_scheduled_jobs` - 列出所有定时任务
- `get_job_status` - 获取定时任务状态
- `trigger_batch_collection` - 批量触发数据采集
- `get_schedule_config` - 获取数据采集计划配置

## 支持的参数

### 时间周期 (Time Period)
```typescript
'ONE'      // 1分钟
'FIVE'     // 5分钟
'FIFTEEN'  // 15分钟
'THIRTY'   // 30分钟
'SIXTY'    // 60分钟
'DAILY'    // 日线
```

### 趋势方向 (Trend Direction)
```typescript
'up'       // 上涨
'down'     // 下跌
```

### 指数类型 (Index Type)
```typescript
1  // 大盘股
2  // 中盘股
3  // 小盘股
```

## 安装

```bash
cd mist
pnpm install
```

## 配置

复制 `.env.example` 到 `.env` 并配置数据库连接：

```bash
cp apps/mcp-server/.env.example apps/mcp-server/.env
```

```env
# MCP Server Configuration
MCP_SERVER_PORT=8009

# Database Configuration
MYSQL_SERVER_HOST=localhost
MYSQL_SERVER_PORT=3306
MYSQL_SERVER_USERNAME=root
MYSQL_SERVER_PASSWORD=your_password
MYSQL_SERVER_DATABASE=mist

# Environment
NODE_ENV=development
```

## 运行

### 开发模式
```bash
cd mist
pnpm run start:dev:mcp-server
```

### 调试模式
```bash
pnpm run start:debug:mcp-server
```

### 生产模式
```bash
pnpm run build
node dist/apps/mcp-server/main.js
```

## 测试

### 运行单元测试

```bash
# 运行所有测试
pnpm test

# 运行 mcp-server 测试
pnpm test -- apps/mcp-server

# 监听模式
pnpm test:watch -- apps/mcp-server

# 覆盖率报告
pnpm test:cov -- apps/mcp-server
```

### 测试结构

```
apps/mcp-server/src/
├── base/
│   └── base-mcp-tool.service.spec.ts    # Base class tests
├── services/
│   ├── chan-mcp.service.spec.ts         # Chan Theory tests
│   ├── indicator-mcp.service.spec.ts    # Technical indicators tests
│   ├── data-mcp.service.spec.ts         # Data query tests
│   └── schedule-mcp.service.spec.ts     # Scheduled task tests
```

### 测试覆盖率

当前测试覆盖率目标：**80%+**

核心测试场景：
- ✅ 所有 MCP tools 的成功响应
- ✅ 所有 MCP tools 的错误处理
- ✅ 参数验证
- ✅ 边界条件测试

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Server (8009)                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ ChanMcp      │  │ Indicator    │  │ DataMcp      │     │
│  │ Service      │  │ McpService   │  │ Service      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │              │
│  ┌──────┴─────────────────┴─────────────────┴───────┐     │
│  │          BaseMcpToolService (Base Class)          │     │
│  │  - executeTool() wrapper                          │     │
│  │  - success() / error() response formatters        │     │
│  │  - Unified logging and error handling             │     │
│  └────────────────────────┬────────────────────────┘     │
└───────────────────────────┼─────────────────────────────┘
                            │
                    stdio (MCP Protocol)
                            │
┌───────────────────────────┴─────────────────────────────┐
│                  AI Agent (Claude/AstrBot)              │
│                   - Task Planning                        │
│                   - Tool Calling                         │
│                   - Result Processing                    │
└───────────────────────────────────────────────────────────┘
```

### 目录结构

```
apps/mcp-server/
├── src/
│   ├── base/
│   │   └── base-mcp-tool.service.ts    # Base class for all MCP tools
│   ├── services/
│   │   ├── chan-mcp.service.ts         # Chan Theory (缠论) analysis
│   │   ├── indicator-mcp.service.ts    # Technical indicators
│   │   ├── data-mcp.service.ts         # Data query tools
│   │   └── schedule-mcp.service.ts     # Scheduled task management
│   ├── types/                          # Shared type definitions
│   ├── mcp-server.module.ts            # MCP module configuration
│   └── main.ts                         # Application entry point
├── test/                               # E2E tests
├── .env.example                        # Environment variables template
├── jest.config.js                      # Jest configuration
└── README.md                           # This file
```

## 与 AI Agent 集成

### Claude Desktop (MCP)

在 Claude Desktop 配置文件中添加 Mist MCP Server：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mist": {
      "command": "node",
      "args": ["/path/to/mist/dist/apps/mcp-server/main.js"],
      "env": {
        "NODE_ENV": "production",
        "MYSQL_SERVER_HOST": "localhost",
        "MYSQL_SERVER_PORT": "3306",
        "MYSQL_SERVER_USERNAME": "root",
        "MYSQL_SERVER_PASSWORD": "your_password",
        "MYSQL_SERVER_DATABASE": "mist"
      }
    }
  }
}
```

### 使用示例

在 Claude Desktop 对话中直接调用 MCP tools：

```
User: 帮我分析一下上证指数最近的缠论形态

Claude: 我来帮你分析上证指数的缠论形态。
[调用 get_daily_kline 获取数据]
[调用 analyze_chan_theory 进行分析]
[生成分析报告...]
```

### 可用的 MCP Tools

#### 数据查询类
- `get_index_info` - 获取指数信息
- `get_kline_data` - 获取分时K线数据
- `get_daily_kline` - 获取日线K线数据
- `list_indices` - 列出所有可用指数
- `get_latest_data` - 获取最新数据

#### 技术指标类
- `calculate_macd` - 计算MACD指标
- `calculate_rsi` - 计算RSI指标
- `calculate_kdj` - 计算KDJ指标
- `calculate_adx` - 计算ADX指标
- `calculate_atr` - 计算ATR指标
- `analyze_indicators` - 完整技术指标分析

#### 缠论分析类
- `create_bi` - 识别笔
- `get_fenxing` - 获取分型
- `analyze_chan_theory` - 完整缠论分析

#### 定时任务类
- `trigger_data_collection` - 触发数据采集
- `list_scheduled_jobs` - 列出定时任务
- `get_job_status` - 获取任务状态
- `trigger_batch_collection` - 批量触发采集
- `get_schedule_config` - 获取计划配置

## API 示例

### 缠论分析

```typescript
// 输入：K线数据（必须包含所有字段）
const k = [
  {
    id: 1,
    symbol: "000001",
    time: "2024-01-02 09:30:00",
    amount: 1000000,
    open: 3120,
    close: 3150,
    highest: 3160,
    lowest: 3115,
  },
  // ... 更多K线数据
];

// 调用 MCP tool
const result = await mcp.call("analyze_chan_theory", { k });

// 返回：完整的缠论分析
{
  success: true,
  data: {
    bis: {
      count: 15,
      data: [
        {
          id: 1,
          type: "UP",
          start: { time: "2024-01-02T09:30:00.000Z", price: 3120 },
          end: { time: "2024-01-02T10:15:00.000Z", price: 3180 }
        },
        // ... 更多笔
      ]
    },
    fenxings: {
      count: 30,
      data: [
        {
          id: 1,
          type: "TOP",
          time: "2024-01-02T09:45:00.000Z",
          price: 3175
        },
        // ... 更多分型
      ]
    },
    channels: {
      count: 3,
      data: [
        {
          id: 1,
          high: 3200,
          low: 3100,
          biCount: 6
        },
        // ... 更多中枢
      ]
    }
  },
  summary: {
    originalKLines: 100,
    bisCount: 15,
    fenxingsCount: 30,
    channelsCount: 3
  }
}
```

### 技术指标

```typescript
// 计算单个指标
const macd = await mcp.call("calculate_macd", {
  prices: [100, 102, 101, 103, 105, 104, 106, 108, 107, 109]
});

// 返回：
{
  success: true,
  data: {
    nbElement: 10,
    macd: [0.5, 1.2, ...],
    signal: [0.3, 0.8, ...],
    histogram: [0.2, 0.4, ...]
  },
  params: {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9
  }
}

// 计算所有指标
const indicators = await mcp.call("analyze_indicators", {
  highs: [102, 104, 103, 105, 107, 106, 108, 110, 109, 111],
  lows: [98, 100, 99, 101, 103, 102, 104, 106, 105, 107],
  closes: [100, 102, 101, 103, 105, 104, 106, 108, 107, 109]
});
```

### 数据查询

```typescript
// 获取指数信息
const indexInfo = await mcp.call("get_index_info", {
  symbol: "000001"
});

// 返回：
{
  success: true,
  data: {
    id: 1,
    symbol: "000001",
    name: "上证指数",
    type: "index"
  }
}

// 获取分时K线数据
const kline = await mcp.call("get_kline_data", {
  symbol: "000001",
  period: "FIVE",  // 5分钟
  limit: 100
});

// 获取日线数据
const dailyKline = await mcp.call("get_daily_kline", {
  symbol: "000001",
  limit: 200,
  startDate: "2024-01-01",
  endDate: "2024-12-31"
});

// 获取最新数据
const latest = await mcp.call("get_latest_data", {
  symbol: "000001"
});

// 返回：
{
  success: true,
  data: {
    symbol: "000001",
    name: "上证指数",
    daily: { /* 日线数据 */ },
    "1min": { /* 1分钟数据 */ },
    "5min": { /* 5分钟数据 */ },
    "15min": { /* 15分钟数据 */ },
    "30min": { /* 30分钟数据 */ },
    "60min": { /* 60分钟数据 */ }
  }
}

// 列出所有指数
const indices = await mcp.call("list_indices");
```

## 开发指南

### 添加新的 MCP Tool

1. 创建 Service 并继承 `BaseMcpToolService`：

```typescript
import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { BaseMcpToolService } from '../base/base-mcp-tool.service';

// Define Zod schema for parameters
const CustomSchema = z.object({
  symbol: z.string(),
  period: z.enum(['ONE', 'FIVE', 'FIFTEEN', 'THIRTY', 'SIXTY']),
  limit: z.number().optional().default(100),
});

@Injectable()
export class CustomMcpService extends BaseMcpToolService {
  constructor(/* Inject dependencies */) {
    super(CustomMcpService.name);
  }

  @Tool({
    name: 'custom_tool_name',
    description: '工具描述',
  })
  async customTool(params: z.infer<typeof CustomSchema>) {
    return this.executeTool('custom_tool_name', async () => {
      // Implementation logic
      const result = await this.doSomething(params);

      // Return data (will be wrapped in success response)
      return {
        data: result,
        count: result.length,
      };
    });
  }
}
```

2. 在 `mcp-server.module.ts` 中注册 Service：

```typescript
@Module({
  imports: [
    // Required modules
  ],
  providers: [CustomMcpService],
})
export class McpServerModule {}
```

### 统一响应格式

所有 MCP tools 返回统一的响应格式：

**成功响应：**
```typescript
{
  success: true,
  data: any,
  ...meta  // Optional metadata (count, params, etc.)
}
```

**错误响应：**
```typescript
{
  success: false,
  error: {
    message: string,
    code?: string
  }
}
```

### 使用 executeTool 包装器

`executeTool` 提供自动日志记录和错误处理：

```typescript
async myTool(param: string) {
  return this.executeTool('my_tool', async () => {
    // This code is wrapped in try-catch
    // Success is automatically logged
    const result = await this.someAsyncOperation(param);
    return { data: result };
  });
}
```

### 参数验证

使用 Zod schema 进行运行时参数验证：

```typescript
const ParamsSchema = z.object({
  symbol: z.string().min(6).max(6),
  period: z.enum(['ONE', 'FIVE', 'FIFTEEN', 'THIRTY', 'SIXTY']),
  limit: z.number().min(1).max(1000).optional(),
});

@Tool({
  name: 'get_data',
  description: 'Get data with validation',
})
async getData(params: z.infer<typeof ParamsSchema>) {
  // params is validated and typed
  return this.executeTool('get_data', async () => {
    // ...
  });
}
```

## 依赖项

### 核心依赖
- `@nestjs/common` - NestJS 核心框架
- `@nestjs/typeorm` - TypeORM 集成
- `@nestjs/schedule` - 定时任务支持
- `@rekog/mcp-nest` - MCP NestJS 集成（Tool 装饰器）
- `typeorm` - ORM
- `mysql2` - MySQL 驱动
- `zod` - 参数验证

### 内部依赖
- `@app/shared-data` - 共享数据实体
- ChanModule - 缠论分析服务
- IndicatorModule - 技术指标计算服务

### 开发依赖
- `@nestjs/testing` - 测试工具
- `jest` - 测试框架
- `ts-jest` - TypeScript Jest 预处理器
- `@types/jest` - Jest 类型定义

## 故障排查

### MCP Server 无法启动

**检查数据库连接：**
```bash
# 测试数据库连接
mysql -h localhost -u root -p mist

# 检查环境变量
cat apps/mcp-server/.env
```

**检查端口占用：**
```bash
# 检查端口 8009 是否被占用
lsof -i :8009
# 或
netstat -an | grep 8009
```

**查看日志：**
```bash
# 启动时应看到以下日志
[MCP Server] Application is starting...
[MCP Server] MCP Server is running
[ChanMcpService] Registered 4 tools
[IndicatorMcpService] Registered 6 tools
[DataMcpService] Registered 5 tools
[ScheduleMcpService] Registered 5 tools
```

### MCP Tools 无法调用

**验证 Tool 注册：**
- 检查 Service 是否使用 `@Tool()` 装饰器
- 检查 Service 是否在 `mcp-server.module.ts` 中注册
- 查看启动日志确认 tools 数量

**测试 Tool 调用：**
```bash
# 通过 stdio 测试
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/apps/mcp-server/main.js
```

### Claude Desktop 无法连接

**检查配置文件路径：**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**验证配置格式：**
```json
{
  "mcpServers": {
    "mist": {
      "command": "node",
      "args": ["/absolute/path/to/dist/apps/mcp-server/main.js"],
      "env": { /* ... */ }
    }
  }
}
```

**查看 Claude Desktop 日志：**
- macOS: `~/Library/Logs/Claude/`
- Windows: `%APPDATA%\Claude\logs\`

### 类型错误

**确保 Zod schema 定义正确：**
```typescript
// ✅ 正确
const Schema = z.object({
  symbol: z.string(),
  period: z.enum(['ONE', 'FIVE']),
});

// ❌ 错误
const Schema = z.object({
  symbol: string,  // 缺少 z.string()
  period: ['ONE', 'FIVE'],  // 缺少 z.enum()
});
```

**检查参数类型：**
- 所有参数必须通过 `z.infer<typeof Schema>` 推断类型
- 数组参数使用 `z.array()`
- 可选参数使用 `.optional()`
- 默认值使用 `.default()`

## 后续计划

- [ ] 添加缓存机制（Redis）
- [ ] 添加更多技术指标
- [ ] 支持实时 WebSocket 数据推送
- [ ] 添加性能监控和日志
- [ ] 完善错误处理和重试机制

## 相关文档

- [Mist 项目文档](../../README.md)
- [缠论算法文档](../../docs/plans/README.md)
- [Claude Desktop](https://claude.ai/download)
- [MCP 规范](https://modelcontextprotocol.io/)

## 更新日志

### v1.0.0 (2025-03-15)

**重构内容：**
- ✅ 修复所有编译错误
- ✅ 创建 BaseMcpToolService 基类
- ✅ 所有服务继承基类，使用 executeTool 包装器
- ✅ 更新为 @Tool 装饰器 + Zod 参数验证
- ✅ 统一响应格式和错误处理
- ✅ 添加单元测试框架

**MCP Tools 总数：20**
- Chan Theory: 3 tools
- Technical Indicators: 6 tools
- Data Query: 5 tools
- Scheduled Tasks: 5 tools
- Base Class: 1 helper

## 性能优化建议

### 数据库查询优化

```typescript
// ✅ 使用查询构建器限制返回字段
const data = await this.repository
  .createQueryBuilder('entity')
  .select(['entity.id', 'entity.field1', 'entity.field2'])
  .where('entity.status = :status', { status: 'active' })
  .limit(100)
  .getMany();

// ❌ 避免查询所有字段
const data = await this.repository.find(); // 查询所有字段和记录
```

### 缓存策略

```typescript
// 建议为常用查询添加缓存（TODO: Redis 集成）
@Cacheable('index_info', 300) // 缓存 5 分钟
async getIndexInfo(symbol: string) {
  // ...
}
```

### 批处理

```typescript
// ✅ 批量处理使用 trigger_batch_collection
const result = await this.triggerBatchCollection(
  ['000001', '000002', '000003'],
  ['ONE', 'FIVE', 'FIFTEEN']
);

// ❌ 避免循环调用
for (const symbol of symbols) {
  for (const period of periods) {
    await this.triggerDataCollection(symbol, period); // 慢
  }
}
```

## 贡献指南

### 代码风格

- 使用 ESLint 和 Prettier 格式化代码
- 遵循 NestJS 最佳实践
- 所有 MCP services 必须继承 `BaseMcpToolService`
- 使用 `executeTool` 包装所有工具逻辑
- 添加适当的 JSDoc 注释

### 提交规范

```bash
# 功能添加
git commit -m "feat: add new tool for XXX"

# Bug 修复
git commit -m "fix: resolve YYY issue in ZZZ"

# 文档更新
git commit -m "docs: update README for AAA"

# 重构
git commit -m "refactor: optimize BBB logic"
```

### 测试要求

- 新功能必须包含单元测试
- 测试覆盖率目标：80%+
- 所有测试必须通过：`pnpm test -- apps/mcp-server`
