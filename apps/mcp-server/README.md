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

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Server (8009)                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Chan MCP     │  │ Indicator    │  │ Data MCP     │     │
│  │ Service      │  │ MCP Service  │  │ Service      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │              │
│  ┌──────┴─────────────────┴─────────────────┴───────┐     │
│  │              MCP Tools (@rekog/mcp-nest)          │     │
│  └────────────────────────┬────────────────────────┘     │
└───────────────────────────┼─────────────────────────────┘
                            │
                    stdio/stderr
                            │
┌───────────────────────────┴─────────────────────────────┐
│                  AI Agent (AstrBot)                      │
│                   - Task Planning                        │
│                   - Tool Calling                         │
│                   - Result Processing                    │
└───────────────────────────────────────────────────────────┘
```

## 与 AstrBot 集成

### 1. 安装 AstrBot

参考 [AstrBot 官网](https://astrbot.app/) 和 [GitHub](https://github.com/AstrBotDevs/AstrBot)

### 2. 配置 MCP Server

在 AstrBot 的配置文件中添加 Mist MCP Server：

```yaml
# astrbot/config/mcp_servers.yaml
mist:
  command: node
  args: ["/path/to/mist/dist/apps/mcp-server/main.js"]
  env:
    NODE_ENV: production
    MYSQL_SERVER_HOST: localhost
    MYSQL_SERVER_PORT: 3306
    MYSQL_SERVER_USERNAME: root
    MYSQL_SERVER_PASSWORD: your_password
    MYSQL_SERVER_DATABASE: mist
```

### 3. 使用示例

在 AstrBot 的工作流中调用 MCP tools：

```python
# 获取上证指数最新数据
result = await mcp.call("get_latest_data", symbol="000001")

# 进行缠论分析
kline = await mcp.call("get_daily_kline", symbol="000001", limit=100)
analysis = await mcp.call("analyze_chan_theory", k=kline["data"])

# 计算技术指标
indicators = await mcp.call("analyze_indicators",
  highs=[...],
  lows=[...],
  closes=[...]
)
```

## API 示例

### 缠论分析

```typescript
// 输入：K线数据
const k = [
  { id: 1, time: "2024-01-02 09:30:00", open: 3120, close: 3150, highest: 3160, lowest: 3115, volume: 1000000, price: 1000000000 },
  // ... 更多K线数据
];

// 调用 MCP tool
const result = await mcp.call("analyze_chan_theory", { k });

// 返回：完整的缠论分析
{
  success: true,
  data: {
    mergedK: { count: 50, data: [...] },
    bis: { count: 15, data: [...] },
    fenxings: { count: 30, data: [...] },
    channels: { count: 3, data: [...] }
  },
  summary: {
    originalKLines: 100,
    mergedKLines: 50,
    bisCount: 15,
    fenxingsCount: 30,
    channelsCount: 3
  }
}
```

### 数据查询

```typescript
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
```

## 开发指南

### 添加新的 MCP Tool

1. 在对应的 Service 中添加 `@MCPTool` 装饰器：

```typescript
import { Injectable } from '@nestjs/common';
import { MCPTool, MCPToolParam } from '@rekog/mcp-nest';

@Injectable()
export class CustomMcpService {
  @MCPTool('tool_name', '工具描述')
  async toolMethod(
    @MCPToolParam('param_name', '参数描述', 'string')
    param: string,
  ) {
    // 实现逻辑
    return {
      success: true,
      data: result,
    };
  }
}
```

2. 在 `mcp-server.module.ts` 中注册 Service：

```typescript
@Module({
  providers: [CustomMcpService],
  // ...
})
```

## 依赖项

- `@nestjs/common` - NestJS 核心框架
- `@nestjs/typeorm` - TypeORM 集成
- `@rekog/mcp-nest` - MCP NestJS 集成
- `modelcontextprotocol-sdk` - MCP SDK
- `typeorm` - ORM
- `mysql2` - MySQL 驱动

## 故障排查

### MCP Server 无法启动

检查数据库连接配置是否正确：
```bash
# 测试数据库连接
mysql -h localhost -u root -p mist
```

### MCP Tools 无法调用

检查日志确认 MCP Server 是否正常运行：
```bash
# 日志应显示
[MCP Server] MCP Server is running on port 8009
```

### AstrBot 无法连接 MCP Server

确认 MCP Server 的路径配置正确，且有执行权限：
```bash
ls -la dist/apps/mcp-server/main.js
```

## 后续计划

- [ ] 添加缓存机制（Redis）
- [ ] 添加更多技术指标
- [ ] 支持实时 WebSocket 数据推送
- [ ] 添加性能监控和日志
- [ ] 完善错误处理和重试机制

## 相关文档

- [Mist 项目文档](../../README.md)
- [缠论算法文档](../../docs/plans/README.md)
- [AstrBot 官网](https://astrbot.app/)
- [MCP 规范](https://modelcontextprotocol.io/)
