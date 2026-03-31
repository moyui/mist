# MCP Server Tool Descriptions Enhancement Design

**Date**: 2026-03-18
**Status**: Design
**Priority**: P0 (Critical for Agent Integration)

## Overview

Enhance all 20 MCP tool descriptions to be more effective for general-purpose AI agents (OpenClaw, ZeroClaw, etc.). Current descriptions are too brief and lack the context agents need to make informed tool selection decisions.

## Problem Statement

### Current Issues

1. **Too Brief**: Descriptions like "计算MACD指标" don't explain purpose or use cases
2. **Missing Context**: Agents don't know WHEN to use each tool
3. **Unclear Requirements**: Minimum data points, input formats not specified
4. **No Output Guidance**: Agents don't know what to expect from results
5. **Language Inconsistency**: Mix of Chinese and English confuses international agents

### Impact on Agents

- Poor tool selection (calling wrong tools for the task)
- Failed API calls (missing input requirements)
- Inefficient workflows (not knowing high-level alternatives)
- Misinterpreted results (no guidance on output interpretation)

## Design Goals

1. **Clear Purpose**: Explain what each tool does and why it matters
2. **Usage Guidance**: Tell agents when to use each tool
3. **Input Clarity**: Specify requirements and constraints upfront
4. **Output Expectations**: Describe return format and key information
5. **Agent-Friendly**: Optimize for LLM comprehension (not human readers)

## Tool Description Template

```typescript
@Tool({
  name: 'tool_name',
  description: `Brief one-line summary.

PURPOSE: What the tool does and why it matters.

WHEN TO USE:
- Scenario 1
- Scenario 2
- Scenario 3

REQUIRES: Input requirements and constraints.
RETURNS: Output format and key information.

[NOTE: For low-level tools only]
NOTE: Consider using 'higher_level_tool' instead for complete functionality.`,
})
```

## Implementation Plan

### Batch 1: P0 - Core Analysis Tools (10 tools)

**Chan Theory Tools (4 tools)**

| Tool | Current Description | Key Enhancement |
|------|---------------------|-----------------|
| `analyze_chan_theory` | "完整的缠论分析..." | Add: One-stop analysis, when to use, output structure |
| `create_bi` | "从K线数据中识别笔..." | Add: Trend identification, minimum 3 K-lines, relationship to fenxing |
| `get_fenxing` | "获取所有分型..." | Add: Pattern detection, top/bottom identification |
| `merge_k` | "合并K线..." | Add: NOTE pointing to analyze_chan_theory |

**Indicator Tools (6 tools)**

| Tool | Current Description | Key Enhancement |
|------|---------------------|-----------------|
| `calculate_macd` | "计算MACD指标..." | Add: Trend momentum, crossover signals, min 26 points |
| `calculate_rsi` | "计算RSI指标..." | Add: Overbought/oversold detection, min 14 points |
| `calculate_kdj` | "计算KDJ指标..." | Add: Oscillator signals, array requirements |
| `calculate_adx` | "计算ADX指标..." | Add: Trend strength measurement |
| `calculate_atr` | "计算ATR指标..." | Add: Volatility measurement |
| `analyze_indicators` | "完整的技术指标分析..." | Add: One-stop convenience, all 5 indicators |

### Batch 2: P1 - Data Query Tools (5 tools)

| Tool | Key Enhancement |
|------|-----------------|
| `get_kline_data` | Clarify intraday periods, time range filtering, limit defaults |
| `get_daily_kline` | Distinguish from intraday, date range format |
| `list_indices` | Discovery tool, use before other data tools |
| `get_index_info` | Metadata lookup, use list_indices first |
| `get_latest_data` | Snapshot of all periods, real-time status |

### Batch 3: P2 - Scheduled Task Tools (5 tools)

| Tool | Key Enhancement |
|------|-----------------|
| `trigger_data_collection` | Manual data refresh, PoC status |
| `trigger_batch_collection` | Bulk operations, efficiency |
| `list_scheduled_jobs` | Monitoring and discovery |
| `get_job_status` | Job monitoring |
| `get_schedule_config` | Configuration inspection |

## Example: Optimization Comparison

### Before
```typescript
@Tool({
  name: 'calculate_macd',
  description: '计算MACD指标（移动平均收敛发散）',
})
```

### After
```typescript
@Tool({
  name: 'calculate_macd',
  description: `Calculate MACD (Moving Average Convergence Divergence) indicator.

PURPOSE: Trend-following momentum indicator that shows the relationship
between two moving averages of a security's price. Widely used for
identifying trend changes and momentum shifts.

WHEN TO USE:
- Analyzing trend strength and direction
- Identifying potential buy/sell signals through MACD/signal line crossovers
- Confirming trend reversals or momentum shifts
- Measuring momentum strength (histogram)

REQUIRES: Array of closing prices. Minimum 26 data points needed for
accurate calculation. More data points provide better signals.

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

## Technical Specifications

### Description Length Guidelines
- **Target**: 250-350 characters per tool
- **Minimum**: 150 characters (simple tools)
- **Maximum**: 500 characters (complex analysis tools)

### Formatting Rules
- Use all-caps section headers (PURPOSE, WHEN TO USE, etc.)
- Use bullet points for lists
- Keep lines under 80 characters when possible
- No emoji or special formatting

### Language Rules
- Pure English only (no Chinese)
- Use standard financial terminology
- Explain jargon when unavoidable (e.g., "bullish momentum")
- Avoid abbreviations unless widely known (MACD, RSI are OK)

### Special Cases

**Low-level tools** should include a NOTE:
```typescript
@Tool({
  name: 'merge_k',
  description: `Merge consecutive K-lines based on containment relationships.

PURPOSE: Groups K-lines to reduce noise while preserving price action.
Used as preprocessing step in Chan Theory analysis.

NOTE: This is a low-level operation. For complete Chan Theory analysis
including merge, Bi, Fenxing, and Channel detection, use
'analyze_chan_theory' tool instead.`,
})
```

**High-level tools** should emphasize convenience:
```typescript
@Tool({
  name: 'analyze_indicators',
  description: `Calculate all major technical indicators in one call.

PURPOSE: Comprehensive technical analysis using 5 key indicators:
MACD, RSI, KDJ, ADX, and ATR.

WHEN TO USE:
- Complete technical overview of a security
- Comparing multiple indicators at once
- Avoiding multiple API calls
- Initial security analysis

REQUIRES: Three arrays (highs, lows, closes) with matching lengths.
RECOMMENDED: 100+ data points for reliable signals.

RETURNS: Object with all 5 indicator results. More efficient than
calling each indicator tool separately.`,
})
```

## Testing Strategy

### Unit Tests
- Verify all descriptions are present
- Check minimum length requirements
- Validate section headers exist
- Test description changes don't break tool registration

### Integration Tests
- Test agent tool selection with sample queries
- Verify error messages mention input requirements
- Confirm NOTE redirects work for low-level tools

### Manual Validation
- Sample queries against each tool
- Verify agent can understand and choose correctly
- Check description clarity with non-financial context

## Success Criteria

1. ✅ All 20 tools have enhanced descriptions
2. ✅ Descriptions follow template structure
3. ✅ Description length within 250-350 character target
4. ✅ Low-level tools include NOTE pointing to high-level alternatives
5. ✅ All descriptions in pure English
6. ✅ Unit tests pass
7. ✅ Agent tool selection improves (measured by fewer failed calls)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Descriptions too long for agent context | Medium | Target 250-350 chars, monitor in testing |
| Financial jargon confuses agents | Low | Explain key terms, use examples |
| Tool behavior changes break descriptions | Low | Keep descriptions synchronized with code |
| Translation needed for Chinese users | Low | Project is English-first for MCP protocol |

## Future Enhancements

Out of scope for this design but worth considering:

1. **Examples Section**: Add concrete usage examples to descriptions
2. **Versioning**: Track description versions for debugging
3. **A/B Testing**: Test different description styles with agents
4. **Dynamic Descriptions**: Generate descriptions from code annotations
5. **Multi-language**: Add Chinese descriptions if international agents struggle

## Timeline Estimate

- **Batch 1 (P0)**: 2-3 hours
- **Batch 2 (P1)**: 1-2 hours
- **Batch 3 (P2)**: 1-2 hours
- **Testing**: 1 hour
- **Total**: 5-8 hours

## References

- MCP Protocol Specification
- OpenAI Function Calling Best Practices
- Anthropic Tool Use Documentation
- Existing tool implementations in `apps/mcp-server/src/services/`
