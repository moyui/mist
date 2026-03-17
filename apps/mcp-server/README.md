# Mist MCP Server

Model Context Protocol (MCP) server for AI-powered stock market analysis.

## Overview

The Mist MCP Server provides AI agents with structured access to stock market analysis tools, including:

- **Chan Theory (缠论)**: Chinese technical analysis methodology
- **Technical Indicators**: MACD, RSI, KDJ, ADX, ATR
- **Data Querying**: K-line data retrieval and filtering
- **Scheduled Tasks**: Data collection management

### What is MCP?

The Model Context Protocol (MCP) enables AI agents to interact with external tools and data sources through a standardized interface. This server exposes stock analysis capabilities as MCP tools that AI agents can call.

### Server Information

- **Name**: `mist-mcp-server`
- **Version**: `1.0.0`
- **Default Port**: 8009
- **Transport**: stdio (for AI agent integration)

## Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8.0+
- pnpm

### Installation

```bash
cd apps/mcp-server
pnpm install
```

### Configuration

Create a `.env` file in the `apps/mcp-server` directory:

```env
# Database
MYSQL_SERVER_HOST=localhost
MYSQL_SERVER_PORT=3306
MYSQL_SERVER_USERNAME=root
MYSQL_SERVER_PASSWORD=your_password
MYSQL_SERVER_DATABASE=mist

# Server
PORT=8009
NODE_ENV=development
```

### Starting the Server

```bash
# From the root directory
pnpm run start:dev:mcp-server

# Or directly
cd apps/mcp-server
pnpm run start:dev
```

The server will log: `MCP Server is running on port 8009`

### Health Check

The MCP Server runs as a standalone application (not an HTTP server). To verify it's working:

1. Check that the process starts without errors
2. Review logs for initialization messages
3. Test tool calls through an MCP client (see Integration Examples below)

## Available Tools

### Chan Theory Tools (4 tools)

Chan Theory is a Chinese technical analysis methodology that identifies patterns in K-line data.

| Tool | Description | Parameters |
|------|-------------|------------|
| `merge_k` | Merge K-lines based on containment relationships | `k: KLine[]` |
| `create_bi` | Identify Bi (笔) - significant price movements | `k: KLine[]` |
| `get_fenxing` | Identify Fenxing (分型) - top and bottom patterns | `k: KLine[]` |
| `analyze_chan_theory` | Complete Chan Theory analysis (merge → Bi → Fenxing → Channel) | `k: KLine[]` |

**KLine Schema:**
```typescript
{
  id: number;
  symbol: string;
  time: string;        // ISO date string
  amount: number;
  open: number;
  close: number;
  highest: number;
  lowest: number;
}
```

**Example - Complete Chan Theory Analysis:**
```json
{
  "tool": "analyze_chan_theory",
  "arguments": {
    "k": [
      {
        "id": 1,
        "symbol": "000001",
        "time": "2024-01-01T09:30:00Z",
        "amount": 1000000,
        "open": 3200.5,
        "close": 3210.8,
        "highest": 3215.0,
        "lowest": 3198.0
      }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "bis": {
      "count": 15,
      "data": [...]
    },
    "fenxings": {
      "count": 8,
      "data": [...]
    },
    "channels": {
      "count": 3,
      "data": [...]
    },
    "summary": {
      "originalKLines": 100,
      "bisCount": 15,
      "fenxingsCount": 8,
      "channelsCount": 3
    }
  }
}
```

### Technical Indicator Tools (6 tools)

Calculate standard technical analysis indicators using the TA-Lib library.

| Tool | Description | Parameters |
|------|-------------|------------|
| `calculate_macd` | Moving Average Convergence Divergence | `prices: number[]` |
| `calculate_rsi` | Relative Strength Index | `prices: number[]`, `period?: number` (default: 14) |
| `calculate_kdj` | Stochastic Oscillator | `highs: number[]`, `lows: number[]`, `closes: number[]`, `period?: number`, `kSmoothing?: number`, `dSmoothing?: number` |
| `calculate_adx` | Average Directional Index | `highs: number[]`, `lows: number[]`, `closes: number[]`, `period?: number` |
| `calculate_atr` | Average True Range | `highs: number[]`, `lows: number[]`, `closes: number[]`, `period?: number` |
| `analyze_indicators` | Complete indicator analysis (all 5 indicators) | `highs: number[]`, `lows: number[]`, `closes: number[]` |

**Example - Calculate MACD:**
```json
{
  "tool": "calculate_macd",
  "arguments": {
    "prices": [3200.5, 3210.8, 3215.0, 3208.3, 3202.1]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "data": [...],
    "params": {
      "fastPeriod": 12,
      "slowPeriod": 26,
      "signalPeriod": 9
    }
  }
}
```

### Data Query Tools (5 tools)

Query stock market data from the MySQL database.

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_index_info` | Get index information by symbol | `symbol: string` |
| `get_kline_data` | Get intraday K-line data | `symbol: string`, `period: 'ONE'\|'FIVE'\|'FIFTEEN'\|'THIRTY'\|'SIXTY'`, `limit?: number`, `startTime?: string`, `endTime?: string` |
| `get_daily_kline` | Get daily K-line data | `symbol: string`, `limit?: number`, `startDate?: string`, `endDate?: string` |
| `list_indices` | List all available indices | (no parameters) |
| `get_latest_data` | Get latest data for all periods | `symbol: string` |

**Period Values:**
- `ONE`: 1-minute
- `FIVE`: 5-minute
- `FIFTEEN`: 15-minute
- `THIRTY`: 30-minute
- `SIXTY`: 60-minute

**Example - List Available Indices:**
```json
{
  "tool": "list_indices",
  "arguments": {}
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "symbol": "000001",
      "name": "上证指数",
      "type": "INDEX"
    },
    {
      "id": 2,
      "symbol": "000300",
      "name": "沪深300",
      "type": "INDEX"
    }
  ]
}
```

**Example - Get K-line Data:**
```json
{
  "tool": "get_kline_data",
  "arguments": {
    "symbol": "000001",
    "period": "FIVE",
    "limit": 100,
    "startTime": "2024-01-01T00:00:00Z",
    "endTime": "2024-12-31T23:59:59Z"
  }
}
```

### Scheduled Task Tools (5 tools)

Manage and monitor scheduled data collection tasks.

| Tool | Description | Parameters |
|------|-------------|------------|
| `trigger_data_collection` | Trigger manual data collection | `symbol: string`, `period: PeriodEnum` |
| `trigger_batch_collection` | Trigger batch data collection | `symbols: string[]`, `periods: PeriodEnum[]` |
| `list_scheduled_jobs` | List all scheduled jobs | (no parameters) |
| `get_job_status` | Get job status | `jobName: string` |
| `get_schedule_config` | Get schedule configuration | (no parameters) |

**Period Values for Scheduled Tasks:**
- `ONE`, `FIVE`, `FIFTEEN`, `THIRTY`, `SIXTY`, `DAILY`

**Example - Trigger Data Collection:**
```json
{
  "tool": "trigger_data_collection",
  "arguments": {
    "symbol": "000001",
    "period": "FIVE"
  }
}
```

**Example - List Scheduled Jobs:**
```json
{
  "tool": "list_scheduled_jobs",
  "arguments": {}
}
```

### Segment Tools (2 stubs - TODO)

These tools are reserved for future implementation.

| Tool | Description | Status |
|------|-------------|--------|
| `create_segment` | Identify Segments from Bi data | ⚠️ TODO: 待实现 |
| `create_segment_channel` | Identify Segment channels | ⚠️ TODO: 待实现 |

**Note**: These tools will return errors indicating they are not yet implemented.

## Error Handling

### Error Response Format

All tools return errors in a standardized format:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE"
  }
}
```

### Error Codes

| Code | Category | Description |
|------|----------|-------------|
| `INVALID_DATE_RANGE` | Validation | Start date is after end date |
| `INVALID_PARAMETER` | Validation | Parameter format or value is invalid |
| `INSUFFICIENT_DATA` | Validation | Not enough data points for calculation |
| `INVALID_PERIOD` | Validation | Period value is out of valid range |
| `INVALID_SYMBOL` | Validation | Symbol format is invalid |
| `INDEX_NOT_FOUND` | Not Found | Index symbol not found in database |
| `DATA_NOT_FOUND` | Not Found | No data found for the given query |
| `DATA_PARSE_ERROR` | Data | Failed to parse input data |
| `INVALID_DATA_FORMAT` | Data | Input data format is incorrect |
| `CALCULATION_ERROR` | Calculation | Indicator calculation failed |
| `INDICATOR_CALCULATION_FAILED` | Calculation | Specific indicator calculation failed |

### Common Errors and Solutions

#### 1. Invalid Symbol
**Error:**
```json
{
  "success": false,
  "error": {
    "message": "Index with symbol \"999999\" not found. Use list_indices to see available symbols.",
    "code": "INDEX_NOT_FOUND"
  }
}
```

**Solution**: Use `list_indices` to get available symbols first.

#### 2. Insufficient Data
**Error:**
```json
{
  "success": false,
  "error": {
    "message": "K-line data must contain at least 3 elements, received: 2. Chan Theory analysis requires at least 3 K-lines to identify patterns.",
    "code": "INSUFFICIENT_DATA"
  }
}
```

**Solution**: Provide more data points. Chan Theory requires at least 3 K-lines.

#### 3. Array Length Mismatch
**Error:**
```json
{
  "success": false,
  "error": {
    "message": "Array length mismatch: highs has 100 elements, but lows has 99 elements. All arrays must have the same length.",
    "code": "INVALID_DATA_FORMAT"
  }
}
```

**Solution**: Ensure all price arrays (highs, lows, closes) have the same length.

#### 4. Invalid Date Range
**Error:**
```json
{
  "success": false,
  "error": {
    "message": "Invalid date range: start date (2024-12-31) must be before end date (2024-01-01).",
    "code": "INVALID_DATE_RANGE"
  }
}
```

**Solution**: Ensure start date is before end date.

#### 5. Invalid Period Value
**Error:**
```json
{
  "success": false,
  "error": {
    "message": "period must be at least 2, received: 1.",
    "code": "INVALID_PERIOD"
  }
}
```

**Solution**: Use a valid period value (e.g., 14 for RSI).

## Integration Examples

### Example 1: Basic Python MCP Client

```python
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    # Connect to MCP Server
    server_params = StdioServerParameters(
        command="pnpm",
        args=["run", "start:dev:mcp-server"],
        env=None
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # Initialize
            await session.initialize()

            # List available tools
            tools = await session.list_tools()
            print("Available tools:", tools.tools)

            # Call a tool
            result = await session.call_tool(
                "list_indices",
                {}
            )
            print("Indices:", result.content)

            # Get K-line data
            result = await session.call_tool(
                "get_kline_data",
                {
                    "symbol": "000001",
                    "period": "FIVE",
                    "limit": 100
                }
            )
            print("K-line data:", result.content)

asyncio.run(main())
```

### Example 2: TypeScript/Javascript MCP Client

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
  const transport = new StdioClientTransport({
    command: 'pnpm',
    args: ['run', 'start:dev:mcp-server'],
  });

  const client = new Client({
    name: 'mist-mcp-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  await client.connect(transport);

  // List available tools
  const tools = await client.listTools();
  console.log('Available tools:', tools.tools);

  // Call list_indices
  const indices = await client.callTool({
    name: 'list_indices',
    arguments: {}
  });
  console.log('Indices:', indices);

  // Get K-line data
  const klineData = await client.callTool({
    name: 'get_kline_data',
    arguments: {
      symbol: '000001',
      period: 'FIVE',
      limit: 100
    }
  });
  console.log('K-line data:', klineData);

  await client.close();
}

main().catch(console.error);
```

### Example 3: AI Agent Integration (LangChain)

```python
from langchain.tools import MCPToolkit
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI
from langchain import hub

# Create MCP toolkit
toolkit = MCPToolkit(
    server_params={
        "command": "pnpm",
        "args": ["run", "start:dev:mcp-server"]
    }
)

# Get tools
tools = toolkit.get_tools()

# Create agent
llm = ChatOpenAI(model="gpt-4", temperature=0)
prompt = hub.pull("hwchase17/openai-functions-agent")
agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Use agent
result = agent_executor.invoke({
    "input": "Analyze the Shanghai Composite Index (000001) using Chan Theory and tell me about the current trend."
})
print(result['output'])
```

### Example 4: Direct Tool Call via Claude Desktop

Add to Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mist-stock-analysis": {
      "command": "pnpm",
      "args": [
        "run",
        "start:dev:mcp-server"
      ],
      "cwd": "/path/to/mist/mist"
    }
  }
}
```

Then in Claude:
```
Can you analyze the Shanghai Composite Index (000001) using Chan Theory?
Please get the latest 5-minute K-line data and identify any Bi patterns.
```

## Development

### Adding New Tools

1. **Create a new service** in `apps/mcp-server/src/services/`:

```typescript
import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { BaseMcpToolService } from '../base/base-mcp-tool.service';

@Injectable()
export class MyMcpService extends BaseMcpToolService {
  constructor() {
    super(MyMcpService.name);
  }

  @Tool({
    name: 'my_tool',
    description: 'Description of what this tool does',
  })
  async myTool(param: z.infer<typeof MySchema>) {
    return this.executeTool('my_tool', async () => {
      // Your tool logic here
      return { result: 'success' };
    });
  }
}
```

2. **Register the service** in `apps/mcp-server/src/mcp-server.module.ts`:

```typescript
import { MyMcpService } from './services/my-mcp.service';

@Module({
  // ...
  providers: [
    // ... existing services
    MyMcpService,
  ],
})
export class McpServerModule {}
```

3. **Add tests** in `apps/mcp-server/src/services/my-mcp.service.spec.ts`

### Testing

```bash
# Unit tests
pnpm test mcp-server

# E2E tests
pnpm test:e2e mcp-server

# Watch mode
pnpm test:watch mcp-server

# Coverage
pnpm test:cov mcp-server
```

### Code Structure

```
apps/mcp-server/
├── src/
│   ├── main.ts                      # Application entry point
│   ├── mcp-server.module.ts         # NestJS module configuration
│   ├── base/
│   │   └── base-mcp-tool.service.ts # Base class for all MCP tools
│   ├── services/
│   │   ├── chan-mcp.service.ts      # Chan Theory tools
│   │   ├── indicator-mcp.service.ts # Technical indicator tools
│   │   ├── data-mcp.service.ts      # Data query tools
│   │   ├── schedule-mcp.service.ts  # Scheduled task tools
│   │   └── segment-mcp.service.ts   # Segment tools (TODO)
│   └── utils/
│       └── validation.helpers.ts    # Validation utilities
└── README.md                        # This file
```

## Architecture

### Dependencies

The MCP Server integrates with other Mist applications:

- **mist**: Uses `ChanService` and `IndicatorService`
- **shared-data**: Uses TypeORM entities (`IndexData`, `IndexPeriod`, `IndexDaily`)
- **utils**: Uses shared utilities
- **config**: Uses configuration management

### Technology Stack

- **@rekog/mcp-nest**: MCP framework for NestJS
- **@nestjs/core**: NestJS framework
- **@nestjs/typeorm**: Database ORM
- **zod**: Runtime type validation
- **talib**: Technical analysis library

## Troubleshooting

### Server Won't Start

1. Check MySQL is running
2. Verify database connection in `.env`
3. Check port 8009 is available
4. Review logs for error messages

### Tools Return Errors

1. Validate input data format matches schema
2. Check error code in response
3. Refer to Error Handling section above
4. Enable debug logging: `NODE_ENV=development`

### Database Connection Issues

```bash
# Test MySQL connection
mysql -h localhost -u root -p

# Check database exists
SHOW DATABASES;
USE mist;
SHOW TABLES;
```

## Support

For issues or questions:

1. Check this README first
2. Review error codes and messages
3. Check test files for usage examples
4. Review service implementations in `apps/mcp-server/src/services/`

## License

BSD-3-Clause
