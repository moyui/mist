# Saya Application

AI Agent system for intelligent stock market analysis using LangChain/LangGraph. Coordinates multiple specialized agents for comprehensive trading insights.

## Features

- **Multi-Agent Architecture**: Specialized AI agents for different analysis tasks
- **LangChain Integration**: Built on LangChain/LangGraph for agent orchestration
- **DeepSeek LLM**: Uses DeepSeek language models for reasoning
- **Agent Roles**: Commander, DataEngineer, Strategist, PatternFinder, SentimentAnalyst, Reporter, RiskMonitor

## Agent Workflow

```
User Command
    ↓
Commander (receives command, plans tasks)
    ↓
DataEngineer (data acquisition, processing, vector storage)
    ↓
Strategist (applies strategy rules, outputs signals)
    ↓
PatternFinder (historical pattern matching)
    ↓
SentimentAnalyst (news/social sentiment analysis)
    ↓
RiskMonitor (market and portfolio risk)
    ↓
Reporter (generates reports and alerts)
```

## Prerequisites

- Node.js (v18+)
- API keys for LLM providers (see Environment Variables)

## Installation

```bash
# Install dependencies
pnpm install
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp src/.env.example src/.env
```

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `REASONING_API_KEY` | API key for reasoning LLM | your_api_key |
| `REASONING_BASE_URL` | Base URL for LLM API | https://ark.cn-beijing.volces.com/api/v3 |
| `REASONING_MODEL` | Model identifier | ep-20250222162205-x9gcs |
| `FAST_API_KEY` | API key for fast LLM | your_api_key |
| `FAST_BASE_URL` | Base URL for fast LLM | https://ark.cn-beijing.volces.com/api/v3 |
| `FAST_MODEL` | Model identifier for fast LLM | ep-20250222162205-x9gcs |
| `VL_API_KEY` | API key for vision-language model | your_api_key |
| `VL_BASE_URL` | Base URL for VL model | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| `VL_MODEL` | Vision model identifier | qwen2.5-vl-72b-instruct |
| `TAVILY_API_KEY` | Tavily search API key | your_tavily_key |
| `DEBUG` | Debug mode | false |
| `APP_ENV` | Environment | development |

## Running the Application

### Development Mode

```bash
pnpm run start:dev:saya
```

The application will be available at `http://localhost:8002`

### Production Build

```bash
# Build the application
pnpm run build

# Start production server
pnpm run start:prod:saya
```

## Agent Descriptions

### Commander
Receives user commands, plans execution, and coordinates other agents.

### DataEngineer
Handles data acquisition, processing, calculation, and vector storage.

### Strategist
Applies predefined strategy rules to generate buy/sell signals.

### PatternFinder
Performs historical pattern matching and probability analysis.

### SentimentAnalyst
Analyzes news and social media sentiment.

### Reporter
Generates comprehensive reports and alerts.

### RiskMonitor
Monitors market and portfolio risk levels.

## Configuration

Agent configurations are stored in `src/config/agents.config.ts`:

```typescript
{
  Commander: {
    llmType: 'reasoning',
    temperature: 0.7,
    maxTokens: 2000
  },
  // ... other agents
}
```

## Prompt Templates

Agent prompts are managed in the `libs/prompts` library. Each agent has specialized prompts:

- `libs/prompts/src/prompts/commander.prompt.ts`
- `libs/prompts/src/prompts/data-engineer.prompt.ts`
- `libs/prompts/src/prompts/strategist.prompt.ts`
- etc.

## Troubleshooting

### LLM API Errors

1. Verify API keys are correct
2. Check base URLs are accessible
3. Ensure model identifiers are valid

### Agent Coordination Issues

Check the LangGraph state flow in `src/role/dto/state.dto.ts`

## License

BSD-3-Clause
