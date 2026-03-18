/**
 * MCP Server Error Codes and Recovery Mapping
 *
 * This module defines standardized error codes for MCP server operations
 * and provides recovery suggestions to help AI agents handle errors gracefully.
 *
 * Error codes are used across all MCP tools to provide consistent error handling
 * and actionable recovery guidance.
 */

/**
 * MCP Server Error Codes
 *
 * These codes represent specific error conditions that can occur during
 * MCP tool execution. Each code has corresponding recovery suggestions.
 */
export enum McpErrorCode {
  /** Date range is invalid (start >= end, wrong format, etc.) */
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',

  /** Generic parameter validation error */
  INVALID_PARAMETER = 'INVALID_PARAMETER',

  /** Not enough data points for the requested calculation */
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',

  /** Invalid time period specified */
  INVALID_PERIOD = 'INVALID_PERIOD',

  /** Stock/index symbol not found or invalid */
  INVALID_SYMBOL = 'INVALID_SYMBOL',

  /** Input arrays have different lengths */
  ARRAY_LENGTH_MISMATCH = 'ARRAY_LENGTH_MISMATCH',

  /** Index not found in database */
  INDEX_NOT_FOUND = 'INDEX_NOT_FOUND',

  /** Requested data not found in database */
  DATA_NOT_FOUND = 'DATA_NOT_FOUND',

  /** Failed to parse data from external source */
  DATA_PARSE_ERROR = 'DATA_PARSE_ERROR',

  /** Data format doesn't match expected schema */
  INVALID_DATA_FORMAT = 'INVALID_DATA_FORMAT',

  /** Generic calculation error */
  CALCULATION_ERROR = 'CALCULATION_ERROR',

  /** Technical indicator calculation failed */
  INDICATOR_CALCULATION_FAILED = 'INDICATOR_CALCULATION_FAILED',
}

/**
 * Custom error class for MCP server operations
 *
 * Usage:
 * ```typescript
 * throw new McpError('Symbol "XYZ" not found', McpErrorCode.INVALID_SYMBOL);
 * ```
 */
export class McpError extends Error {
  constructor(
    message: string,
    public code: McpErrorCode,
  ) {
    super(message);
    this.name = 'McpError';
  }
}

/**
 * Recovery suggestion for an error code
 */
interface RecoverySuggestion {
  /** Array of suggestions for resolving the error */
  suggestions: string[];
  /** Optional next tool to try with reasoning */
  next_tool?: {
    /** Tool name to try next */
    name: string;
    /** Why this tool might help */
    reason: string;
    /** Optional parameter adjustments */
    params?: Record<string, any>;
  };
}

/**
 * MCP Error Recovery Mapping
 *
 * Maps each error code to recovery suggestions and optional next tool.
 * This helps AI agents recover from errors by providing actionable guidance.
 */
export const MCP_ERROR_RECOVERY: Record<McpErrorCode, RecoverySuggestion> = {
  [McpErrorCode.INVALID_DATE_RANGE]: {
    suggestions: [
      'Ensure the start date is before the end date',
      'Use ISO 8601 format: YYYY-MM-DD',
      'Check that dates are valid calendar dates',
      'Verify date strings are not empty or malformed',
    ],
  },

  [McpErrorCode.INVALID_PARAMETER]: {
    suggestions: [
      'Check parameter format and type',
      'Verify required parameters are provided',
      'Review tool documentation for valid parameter ranges',
      'Ensure parameter values match expected types (string, number, etc.)',
    ],
  },

  [McpErrorCode.INSUFFICIENT_DATA]: {
    suggestions: [
      'Use get_kline_data to fetch more historical data',
      'Try using a different indicator that requires fewer data points',
      'Extend the date range to include more data points',
      'Check if the symbol has sufficient trading history',
    ],
    next_tool: {
      name: 'get_kline_data',
      reason:
        'Fetches more K-line data to ensure sufficient data points for calculations',
    },
  },

  [McpErrorCode.INVALID_PERIOD]: {
    suggestions: [
      'Valid periods: 1min, 5min, 15min, 30min, 60min, daily',
      'Check indicator documentation for supported periods',
      'Ensure period value is a string',
      'Verify the period is available for the requested symbol',
    ],
  },

  [McpErrorCode.INVALID_SYMBOL]: {
    suggestions: [
      'Use list_indices to get valid index symbols',
      'Symbol cannot be empty or null',
      'Check symbol format (e.g., "sh.000001" for Shanghai Composite)',
      'Verify the symbol exists in the database',
    ],
    next_tool: {
      name: 'list_indices',
      reason: 'Lists all available indices to help identify valid symbols',
    },
  },

  [McpErrorCode.ARRAY_LENGTH_MISMATCH]: {
    suggestions: [
      'Ensure all input arrays have the same length',
      'Check that data is aligned by timestamp',
      'Verify no data points are missing or duplicated',
      'Use get_kline_data to fetch complete aligned datasets',
    ],
  },

  [McpErrorCode.INDEX_NOT_FOUND]: {
    suggestions: [
      'Use list_indices to see all available indices',
      'Verify the symbol code is correct',
      'Check if the index exists in the database',
      'Ensure the symbol format matches the expected pattern',
    ],
    next_tool: {
      name: 'list_indices',
      reason: 'Shows all available indices to verify the correct symbol code',
    },
  },

  [McpErrorCode.DATA_NOT_FOUND]: {
    suggestions: [
      'Check if data exists for the requested date range',
      'Use list_indices to verify the symbol is available',
      'Try a different date range',
      'Ensure the database has been populated with data',
    ],
    next_tool: {
      name: 'list_indices',
      reason: 'Verifies the symbol exists and shows available data ranges',
    },
  },

  [McpErrorCode.DATA_PARSE_ERROR]: {
    suggestions: [
      'Check data format and structure',
      'Verify data source is returning valid JSON',
      'Ensure required fields are present in the data',
      'Check for malformed or corrupted data',
    ],
  },

  [McpErrorCode.INVALID_DATA_FORMAT]: {
    suggestions: [
      'Verify input data matches the expected schema',
      'Check that all required fields are present',
      'Ensure data types are correct (numbers, strings, etc.)',
      'Review tool documentation for expected data format',
    ],
  },

  [McpErrorCode.CALCULATION_ERROR]: {
    suggestions: [
      'Check data quality for null or NaN values',
      'Verify input data is valid and complete',
      'Ensure data points are in chronological order',
      'Try with a different date range or symbol',
    ],
  },

  [McpErrorCode.INDICATOR_CALCULATION_FAILED]: {
    suggestions: [
      'Try a different technical indicator',
      'Check data source quality and completeness',
      'Verify the indicator is supported for this data type',
      'Ensure sufficient data points for the indicator calculation',
    ],
  },
};
