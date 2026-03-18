# MCP Server Tool Descriptions Enhancement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance all 20 MCP tool descriptions to be more effective for general-purpose AI agents by providing clear purpose, usage guidance, input requirements, and output expectations.

**Architecture:** Update @Tool decorator descriptions in 4 service files. No code logic changes, only string enhancements to improve agent comprehension.

**Tech Stack:** NestJS, @rekog/mcp-nest, TypeScript, Zod

---

## File Structure

Files to modify:
- `apps/mcp-server/src/services/chan-mcp.service.ts` - 4 Chan Theory tools
- `apps/mcp-server/src/services/indicator-mcp.service.ts` - 6 Indicator tools
- `apps/mcp-server/src/services/data-mcp.service.ts` - 5 Data Query tools
- `apps/mcp-server/src/services/schedule-mcp.service.ts` - 5 Scheduled Task tools

Each file requires only string updates to `@Tool` decorator descriptions. No logic changes.

---

## Batch 1: P0 - Core Analysis Tools (10 tools)

### Task 1: Enhance Chan Theory Tool Descriptions

**Files:**
- Modify: `apps/mcp-server/src/services/chan-mcp.service.ts`

- [ ] **Step 0: Verify baseline tests pass (TDD)**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm test mcp-server
```

Expected: All tests pass (establish baseline before making changes)

- [ ] **Step 1: Update analyze_chan_theory description**

Replace the `@Tool` decorator for `analyzeChanTheory` method (line 128-131):

```typescript
@Tool({
  name: 'analyze_chan_theory',
  description: `Complete Chan Theory analysis in one call.

PURPOSE: Performs full Chan Theory technical analysis including K-line merging,
Bi (trend line) identification, Fenxing (pattern) detection, and Channel
(consolidation zone) recognition.

WHEN TO USE:
- Complete technical analysis using Chinese Chan Theory methodology
- Identifying trend patterns, support/resistance levels, and pivot points
- One-stop analysis instead of calling individual tools
- Analyzing market structure and potential turning points

REQUIRES: Array of K-line data objects. Minimum 3 K-lines required.
Recommended 50+ K-lines for meaningful pattern detection.

RETURNS: Object containing:
- bis: Array of identified trend lines with direction and status
- fenxings: Array of top and bottom patterns
- channels: Array of consolidation zones with extensions
- summary: Count statistics for original K-lines and detected patterns`,
})
```

- [ ] **Step 2: Update create_bi description**

Replace the `@Tool` decorator for `createBi` method (line 60-63):

```typescript
@Tool({
  name: 'create_bi',
  description: `Identify Bi (笔) - significant price movements in Chan Theory.

PURPOSE: Detects trend lines (Bi) by identifying consecutive top and bottom
patterns (Fenxing). Bi represents meaningful price movements in the direction
of the trend.

WHEN TO USE:
- Identifying trend direction and strength
- Finding support and resistance levels
- Analyzing price structure and pivot points
- Building blocks for Channel (中枢) detection

REQUIRES: Array of K-line data objects. Minimum 3 K-lines required.
Minimum 5 K-lines recommended for reliable Bi detection.

RETURNS: Array of Bi objects containing:
- Start/end time and price levels
- Trend direction (UP/DOWN)
- Status (COMPLETE, UNCOMPLETE, INITIAL)
- Constituent Fenxing patterns`,
})
```

- [ ] **Step 3: Update get_fenxing description**

Replace the `@Tool` decorator for `getFenxing` method (line 94-97):

```typescript
@Tool({
  name: 'get_fenxing',
  description: `Identify Fenxing (分型) - top and bottom patterns in Chan Theory.

PURPOSE: Detects local tops (顶分型) and bottoms (底分型) which are
foundational patterns for identifying trend lines (Bi) in Chan Theory analysis.

WHEN TO USE:
- Finding local price extremes and pivot points
- Building blocks for Bi (trend line) identification
- Analyzing short-term price reversals
- Pattern recognition in market structure

REQUIRES: Array of K-line data objects. Minimum 3 K-lines required
(at least one middle K-line with two neighbors).

RETURNS: Array of Fenxing objects containing:
- Type (TOP or BOTTOM)
- Pattern time and price levels
- K-line index position`,
})
```

- [ ] **Step 4: Update merge_k description with NOTE**

Replace the `@Tool` decorator for `mergeK` method (line 44-47):

```typescript
@Tool({
  name: 'merge_k',
  description: `Merge consecutive K-lines based on containment relationships.

PURPOSE: Groups consecutive K-lines to reduce noise while preserving
essential price action. Used as preprocessing in Chan Theory analysis.

WHEN TO USE:
- Generally, DO NOT use this directly
- Use analyze_chan_theory for complete analysis instead

NOTE: This is a low-level preprocessing operation. For complete Chan Theory
analysis including merge, Bi, Fenxing, and Channel detection, use the
'analyze_chan_theory' tool instead.`,
})
```

- [ ] **Step 5: Run Chan Theory tests**

```bash
pnpm test mcp-server
```

Expected: All tests pass (no logic changes, only description updates)

- [ ] **Step 5.5: Verify description character counts**

```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('apps/mcp-server/src/services/chan-mcp.service.ts', 'utf8');
const matches = content.match(/description: \`[^]+?\`/g) || [];
console.log('Chan Theory descriptions:');
matches.forEach((m, i) => {
  const len = m.length;
  const status = len >= 250 && len <= 500 ? '✓' : '✗';
  console.log(\`  Tool \${i+1}: \${len} chars \${status} (target: 250-350, max: 500)\`);
});
"
```

Expected: All descriptions show ✓ (within target range)

- [ ] **Step 6: Commit Batch 1.1 - Chan Theory descriptions**

```bash
git add apps/mcp-server/src/services/chan-mcp.service.ts
git commit -m "feat(mcp): enhance Chan Theory tool descriptions for agents

- Add structured format (PURPOSE, WHEN TO USE, REQUIRES, RETURNS)
- Clarify minimum data requirements
- Add NOTE to merge_k pointing to analyze_chan_theory
- Improve agent comprehension for tool selection

Part of P0 batch: Chan Theory tools (4 tools)"
```

### Task 2: Enhance Indicator Tool Descriptions

**Files:**
- Modify: `apps/mcp-server/src/services/indicator-mcp.service.ts`

- [ ] **Step 1: Update calculate_macd description**

Replace the `@Tool` decorator for `calculateMacd` method (line 18-21):

```typescript
@Tool({
  name: 'calculate_macd',
  description: `Calculate MACD (Moving Average Convergence Divergence) indicator.

PURPOSE: Trend-following momentum indicator showing the relationship between
two moving averages of a security's price. Widely used for identifying trend
changes and momentum shifts through crossovers.

WHEN TO USE:
- Analyzing trend strength and direction
- Identifying potential buy/sell signals through MACD/signal line crossovers
- Confirming trend reversals or momentum shifts
- Measuring momentum strength (histogram expansion/contraction)

REQUIRES: Array of closing prices. Minimum 26 data points needed for
accurate calculation. More data points (100+) provide better signals.

RETURNS: Object containing:
- MACD line values (fast EMA - slow EMA)
- Signal line values (EMA of MACD line)
- Histogram values (MACD - Signal)
- Parameters used: fast period (12), slow period (26), signal period (9)

INTERPRETATION:
- MACD above Signal: Bullish momentum
- MACD below Signal: Bearish momentum
- Positive Histogram: Increasing bullish momentum
- Negative Histogram: Increasing bearish momentum`,
})
```

- [ ] **Step 2: Update calculate_rsi description**

Replace the `@Tool` decorator for `calculateRsi` method (line 42-45):

```typescript
@Tool({
  name: 'calculate_rsi',
  description: `Calculate RSI (Relative Strength Index) indicator.

PURPOSE: Momentum oscillator that measures the speed and change of price
movements. Identifies overbought and oversold conditions.

WHEN TO USE:
- Detecting overbought (RSI > 70) or oversold (RSI < 30) conditions
- Identifying potential trend reversals
- Measuring momentum strength
- Confirming trend direction with divergences

REQUIRES: Array of closing prices. Default period is 14, minimum 2.
Minimum 14 data points needed for meaningful calculation.

RETURNS: Array of RSI values (0-100 scale).
Parameters: period (default 14, customizable)

INTERPRETATION:
- RSI > 70: Overbought, potential pullback
- RSI < 30: Oversold, potential bounce
- RSI around 50: Neutral zone`,
})
```

- [ ] **Step 3: Update calculate_kdj description**

Replace the `@Tool` decorator for `calculateKdj` method (line 71-74):

```typescript
@Tool({
  name: 'calculate_kdj',
  description: `Calculate KDJ (Stochastic Oscillator) indicator.

PURPOSE: Momentum indicator comparing a security's close price to its
price range over a period. Popular in Asian markets for timing entries
and exits.

WHEN TO USE:
- Identifying overbought/oversold conditions
- Timing entry and exit points
- Detecting potential reversals
- Short-term trading signals

REQUIRES: Three arrays (highs, lows, closes) with matching lengths.
Default period is 9. Minimum 50 data points recommended.

RETURNS: Object containing K, D, and J line values.
Parameters: period (9), K smoothing (3), D smoothing (3)

INTERPRETATION:
- K > 80 or D > 80: Overbought zone
- K < 20 or D < 20: Oversold zone
- K crossing above D: Bullish signal
- K crossing below D: Bearish signal`,
})
```

- [ ] **Step 4: Update calculate_adx description**

Replace the `@Tool` decorator for `calculateAdx` method (line 148-151):

```typescript
@Tool({
  name: 'calculate_adx',
  description: `Calculate ADX (Average Directional Index) indicator.

PURPOSE: Measures trend strength regardless of direction. Does NOT indicate
trend direction, only how strong the trend is.

WHEN TO USE:
- Determining if a trend is strong enough to trade
- Filtering ranging vs trending markets
- Confirming trend strength before entries
- Avoiding whipsaws in ranging markets

REQUIRES: Three arrays (highs, lows, closes) with matching lengths.
Default period is 14. Minimum 30 data points recommended.

RETURNS: Array of ADX values (0-100 scale typically).
Parameters: period (default 14)

INTERPRETATION:
- ADX > 25: Strong trend (trade with trend)
- ADX < 20: Weak or no trend (avoid trend following)
- ADX 20-25: Transition zone`,
})
```

- [ ] **Step 5: Update calculate_atr description**

Replace the `@Tool` decorator for `calculateAtr` method (line 172-175):

```typescript
@Tool({
  name: 'calculate_atr',
  description: `Calculate ATR (Average True Range) indicator.

PURPOSE: Measures market volatility by analyzing the range of price movement.
Useful for position sizing and stop loss placement.

WHEN TO USE:
- Measuring current market volatility
- Setting stop loss levels based on volatility
- Position sizing (risk management)
- Identifying low vs high volatility periods

REQUIRES: Three arrays (highs, lows, closes) with matching lengths.
Default period is 14. Minimum 14 data points needed.

RETURNS: Array of ATR values in price units.
Parameters: period (default 14)

INTERPRETATION:
- Higher ATR: Higher volatility, wider stops
- Lower ATR: Lower volatility, tighter stops
- Compare ATR to price for relative volatility`,
})
```

- [ ] **Step 6: Update analyze_indicators description**

Replace the `@Tool` decorator for `analyzeIndicators` method (line 196-199):

```typescript
@Tool({
  name: 'analyze_indicators',
  description: `Calculate all major technical indicators in one call.

PURPOSE: Comprehensive technical analysis using 5 key indicators: MACD,
RSI, KDJ, ADX, and ATR. More efficient than calling each indicator separately.

WHEN TO USE:
- Complete technical overview of a security
- Comparing multiple indicators at once
- Avoiding multiple API calls
- Initial security analysis or screening
- When you need multiple indicators for confirmation

REQUIRES: Three arrays (highs, lows, closes) with matching lengths.
Recommended 100+ data points for reliable signals across all indicators.

RETURNS: Object with all 5 indicator results:
- macd: Trend momentum (MACD, signal, histogram)
- rsi: Overbought/oversold (0-100 scale)
- kdj: Stochastic signals (K, D, J lines)
- adx: Trend strength (0-100 scale)
- atr: Volatility measurement

More efficient than calling each indicator tool separately.`,
})
```

- [ ] **Step 7: Run Indicator tests**

```bash
pnpm test mcp-server
```

Expected: All tests pass

- [ ] **Step 7.5: Verify description character counts**

```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('apps/mcp-server/src/services/indicator-mcp.service.ts', 'utf8');
const matches = content.match(/description: \`[^]+?\`/g) || [];
console.log('Indicator descriptions:');
matches.forEach((m, i) => {
  const len = m.length;
  const status = len >= 250 && len <= 500 ? '✓' : '✗';
  console.log(\`  Tool \${i+1}: \${len} chars \${status} (target: 250-350, max: 500)\`);
});
"
```

Expected: All descriptions show ✓ (within target range)

- [ ] **Step 8: Commit Batch 1.2 - Indicator descriptions**

```bash
git add apps/mcp-server/src/services/indicator-mcp.service.ts
git commit -m "feat(mcp): enhance Indicator tool descriptions for agents

- Add structured format with interpretation guides
- Clarify minimum data requirements (26 for MACD, 14 for RSI, etc.)
- Add trading signal interpretation for each indicator
- Emphasize analyze_indicators as one-stop solution

Part of P0 batch: Indicator tools (6 tools)"
```

---

## Batch 2: P1 - Data Query Tools (5 tools)

### Task 3: Enhance Data Query Tool Descriptions

**Files:**
- Modify: `apps/mcp-server/src/services/data-mcp.service.ts`

- [ ] **Step 1: Update get_kline_data description**

Replace the `@Tool` decorator for `getKlineData` method (line 62-65):

```typescript
@Tool({
  name: 'get_kline_data',
  description: `Get intraday K-line (candlestick) data from database.

PURPOSE: Retrieve historical intraday price data for technical analysis.
Contains open, close, high, low, and volume for each time period.

WHEN TO USE:
- Getting historical price data for analysis
- Feeding data into indicator or Chan Theory tools
- Analyzing intraday price patterns
- Backtesting strategies

REQUIRES:
- symbol: Index code (e.g., '000001' for Shanghai Composite)
- period: Time granularity (ONE, FIVE, FIFTEEN, THIRTY, SIXTY minutes)
- Optional: limit (default 100), startTime, endTime for filtering

NOTE: Use list_indices first to get available symbols.
Use get_daily_kline for daily data instead.

RETURNS: Array of K-line objects containing time, OHLC prices, and volume.`,
})
```

- [ ] **Step 2: Update get_daily_kline description**

Replace the `@Tool` decorator for `getDailyKline` method (line 134-137):

```typescript
@Tool({
  name: 'get_daily_kline',
  description: `Get daily K-line (candlestick) data from database.

PURPOSE: Retrieve historical daily price data for longer-term analysis.
Contains open, close, high, low, volume, and amount for each day.

WHEN TO USE:
- Daily or swing trading analysis
- Long-term trend identification
- Higher timeframe analysis
- When intraday detail is not needed

REQUIRES:
- symbol: Index code (e.g., '000001' for Shanghai Composite)
- Optional: limit (default 100), startDate, endDate for filtering

NOTE: Use list_indices first to get available symbols.
Use get_kline_data for intraday periods.

RETURNS: Array of daily K-line objects with OHLC, volume, and amount.`,
})
```

- [ ] **Step 3: Update list_indices description**

Replace the `@Tool` decorator for `listIndices` method (line 205-208):

```typescript
@Tool({
  name: 'list_indices',
  description: `List all available stock indices in the database.

PURPOSE: Discovery tool to find which indices are available for analysis.
Use this BEFORE calling other data tools to ensure the symbol exists.

WHEN TO USE:
- Finding available index symbols
- Discovering what data is available
- First step before any data query
- Validating symbol codes

REQUIRES: No parameters.

RETURNS: Array of index objects containing:
- id: Database ID
- symbol: Index code (e.g., '000001')
- name: Index name (e.g., '上证指数')
- type: Security type (INDEX)

NOTE: This should be your first data query tool call.`,
})
```

- [ ] **Step 4: Update get_index_info description**

Replace the `@Tool` decorator for `getIndexInfo` method (line 29-32):

```typescript
@Tool({
  name: 'get_index_info',
  description: `Get detailed metadata for a specific index.

PURPOSE: Retrieve index information and metadata. Useful for validating
symbol existence and getting basic index details.

WHEN TO USE:
- Validating an index symbol before detailed queries
- Getting index metadata
- Checking if an index exists in database
- Quick index lookup

REQUIRES: symbol - Index code (e.g., '000001')

NOTE: Use list_indices to see all available symbols first.

RETURNS: Index object with id, symbol, name, and type.`,
})
```

- [ ] **Step 5: Update get_latest_data description**

Replace the `@Tool` decorator for `getLatestData` method (line 218-221):

```typescript
@Tool({
  name: 'get_latest_data',
  description: `Get the latest K-line data for all time periods.

PURPOSE: Retrieve the most recent data point across all timeframes
(daily and all intraday periods) in a single call.

WHEN TO USE:
- Getting current market snapshot
- Checking data freshness
- Quick status check across all periods
- Real-time market overview

REQUIRES: symbol - Index code (e.g., '000001')

RETURNS: Object containing latest data for:
- daily: Most recent daily K-line
- 1min, 5min, 15min, 30min, 60min: Latest intraday K-lines

Each contains time, OHLC prices, and volume.`,
})
```

- [ ] **Step 6: Run Data Query tests**

```bash
pnpm test mcp-server
```

Expected: All tests pass

- [ ] **Step 6.5: Verify description character counts**

```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('apps/mcp-server/src/services/data-mcp.service.ts', 'utf8');
const matches = content.match(/description: \`[^]+?\`/g) || [];
console.log('Data Query descriptions:');
matches.forEach((m, i) => {
  const len = m.length;
  const status = len >= 250 && len <= 500 ? '✓' : '✗';
  console.log(\`  Tool \${i+1}: \${len} chars \${status} (target: 250-350, max: 500)\`);
});
"
```

Expected: All descriptions show ✓ (within target range)

- [ ] **Step 7: Commit Batch 2 - Data Query descriptions**

```bash
git add apps/mcp-server/src/services/data-mcp.service.ts
git commit -m "feat(mcp): enhance Data Query tool descriptions for agents

- Add structured format clarifying each tool's purpose
- Emphasize list_indices as discovery tool (use first)
- Distinguish intraday vs daily data tools
- Add workflow guidance (list before query)

Part of P1 batch: Data Query tools (5 tools)"
```

---

## Batch 3: P2 - Scheduled Task Tools (5 tools)

### Task 4: Enhance Scheduled Task Tool Descriptions

**Files:**
- Modify: `apps/mcp-server/src/services/schedule-mcp.service.ts`

- [ ] **Step 1: Update trigger_data_collection description**

Replace the `@Tool` decorator for `triggerDataCollection` method (line 44-47):

```typescript
@Tool({
  name: 'trigger_data_collection',
  description: `Manually trigger data collection for a specific index and period.

PURPOSE: On-demand data refresh outside the scheduled collection times.
Useful for getting the latest data or filling gaps in historical data.

WHEN TO USE:
- Refreshing data outside scheduled times
- Filling missing historical data
- Testing data collection
- Immediate data update needs

REQUIRES:
- symbol: Index code (e.g., '000001')
- period: Time period (ONE, FIVE, FIFTEEN, THIRTY, SIXTY, DAILY)

NOTE: This is a PoC implementation. In production, integrates with
the actual schedule app's data collection service.

RETURNS: Job confirmation with symbol, period, timestamp, and job ID.`,
})
```

- [ ] **Step 2: Update trigger_batch_collection description**

Replace the `@Tool` decorator for `triggerBatchCollection` method (line 128-131):

```typescript
@Tool({
  name: 'trigger_batch_collection',
  description: `Trigger data collection for multiple indices and periods.

PURPOSE: Efficiently trigger data collection for multiple combinations
of indices and time periods in a single batch operation.

WHEN TO USE:
- Collecting data for multiple indices at once
- Bulk data refresh operations
- Filling gaps across multiple symbols
- Efficient batch updates

REQUIRES:
- symbols: Array of index codes
- periods: Array of time periods

NOTE: More efficient than multiple trigger_data_collection calls.

RETURNS: Batch job confirmation with task count and sample tasks.`,
})
```

- [ ] **Step 3: Update list_scheduled_jobs description**

Replace the `@Tool` decorator for `listScheduledJobs` method (line 74-77):

```typescript
@Tool({
  name: 'list_scheduled_jobs',
  description: `List all configured scheduled data collection jobs.

PURPOSE: Discovery tool to see what scheduled tasks exist and their status.
Useful for monitoring and debugging scheduled data collection.

WHEN TO USE:
- Checking what scheduled jobs are configured
- Monitoring job status
- Debugging data collection issues
- Overview of automation schedule

REQUIRES: No parameters.

RETURNS: Array of job objects with name and running status.`,
})
```

- [ ] **Step 4: Update get_job_status description**

Replace the `@Tool` decorator for `getJobStatus` method (line 99-102):

```typescript
@Tool({
  name: 'get_job_status',
  description: `Get detailed status of a specific scheduled job.

PURPOSE: Retrieve status information for a single scheduled job including
running state and last execution time.

WHEN TO USE:
- Checking if a specific job is running
- Monitoring job execution
- Debugging job issues
- Getting job metadata

REQUIRES: jobName - Name of the scheduled job

NOTE: Use list_scheduled_jobs to get available job names first.

RETURNS: Job object with name, running status, and last execution time.`,
})
```

- [ ] **Step 5: Update get_schedule_config description**

Replace the `@Tool` decorator for `getScheduleConfig` method (line 163-166):

```typescript
@Tool({
  name: 'get_schedule_config',
  description: `Get the data collection schedule configuration.

PURPOSE: View the current schedule configuration for all automated data
collection jobs. Shows cron expressions and descriptions.

WHEN TO USE:
- Understanding when data is collected
- Checking automation schedule
- Configuring or debugging schedules
- Documentation of data collection timing

REQUIRES: No parameters.

RETURNS: Schedule configuration with:
- Job names and descriptions
- Time periods (ONE, FIVE, FIFTEEN, etc.)
- Cron expressions for execution times
- Human-readable schedule descriptions`,
})
```

- [ ] **Step 6: Run Scheduled Task tests**

```bash
pnpm test mcp-server
```

Expected: All tests pass

- [ ] **Step 6.5: Verify description character counts**

```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('apps/mcp-server/src/services/schedule-mcp.service.ts', 'utf8');
const matches = content.match(/description: \`[^]+?\`/g) || [];
console.log('Scheduled Task descriptions:');
matches.forEach((m, i) => {
  const len = m.length;
  const status = len >= 250 && len <= 500 ? '✓' : '✗';
  console.log(\`  Tool \${i+1}: \${len} chars \${status} (target: 250-350, max: 500)\`);
});
"
```

Expected: All descriptions show ✓ (within target range)

- [ ] **Step 7: Commit Batch 3 - Scheduled Task descriptions**

```bash
git add apps/mcp-server/src/services/schedule-mcp.service.ts
git commit -m "feat(mcp): enhance Scheduled Task tool descriptions for agents

- Add structured format for task management tools
- Clarify PoC status for trigger tools
- Emphasize list_scheduled_jobs for discovery
- Add workflow guidance (list before status check)

Part of P2 batch: Scheduled Task tools (5 tools)"
```

---

## Final Verification

### Task 5: Comprehensive Testing and Documentation

- [ ] **Step 1: Run all MCP Server tests**

```bash
pnpm test mcp-server
```

Expected: All tests pass (no functional changes)

- [ ] **Step 1.5: Verify all 20 tool descriptions**

```bash
node -e "
const services = [
  'apps/mcp-server/src/services/chan-mcp.service.ts',
  'apps/mcp-server/src/services/indicator-mcp.service.ts',
  'apps/mcp-server/src/services/data-mcp.service.ts',
  'apps/mcp-server/src/services/schedule-mcp.service.ts'
];
const fs = require('fs');
let total = 0;
services.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(/description: \`[^]+?\`/g) || [];
  console.log(\`\${file.split('/').pop()}: \${matches.length} tools\`);
  matches.forEach((m) => {
    total++;
    const len = m.length;
    if (len < 250) console.log(\`  ⚠️  Short: \${len} chars\`);
    if (len > 500) console.log(\`  ⚠️  Long: \${len} chars\`);
  });
});
console.log(\`\nTotal: \${total} tool descriptions\`);
console.log('Target: 250-350 chars (max 500)');
"
```

Expected: 20 total tools, all within target range

- [ ] **Step 2: Verify tool registration**

```bash
pnpm run start:dev:mcp-server
```

Expected: Server starts without errors, all 20 tools registered

- [ ] **Step 3: Test tool descriptions with sample agent query**

Manually verify descriptions are clear by reviewing:
- All 20 tools have enhanced descriptions
- Each description follows the template structure
- Low-level tools have NOTE pointing to high-level alternatives
- Descriptions are in pure English
- Length is within 250-350 character target

- [ ] **Step 4: Update README documentation**

Edit `apps/mcp-server/README.md` to reflect enhanced descriptions.
Add a note about improved agent comprehension in the Overview section.

- [ ] **Step 5: Final commit**

```bash
git add apps/mcp-server/README.md
git commit -m "docs(mcp): update README for enhanced tool descriptions

- Note improved agent comprehension
- Reference description enhancements
- Document tool selection improvements"
```

- [ ] **Step 6: Create summary**

Create a summary of changes:
- 20 tools enhanced across 4 service files
- 3 commits (one per batch)
- Description template established
- Low-level tools now redirect to high-level alternatives

---

## Success Criteria

After implementation, verify:

- ✅ All 20 tools have enhanced descriptions
- ✅ Descriptions follow structured template (PURPOSE, WHEN TO USE, REQUIRES, RETURNS)
- ✅ Description length within 250-350 characters
- ✅ Low-level tools include NOTE with alternatives
- ✅ All descriptions in pure English
- ✅ All unit tests pass
- ✅ MCP Server starts without errors
- ✅ README updated

## Notes

- No functional code changes, only description string updates
- Tests should pass without modification (no behavior changes)
- Commit messages follow conventional commit format
- Each batch is independently testable and commit-able
- Can stop after any batch if needed (P0 → P1 → P2 priority)
