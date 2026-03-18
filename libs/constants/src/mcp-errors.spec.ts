import { McpError, McpErrorCode, MCP_ERROR_RECOVERY } from './mcp-errors';

describe('MCP Errors', () => {
  describe('McpErrorCode', () => {
    it('should have all 12 error codes', () => {
      expect(Object.keys(McpErrorCode).length).toBe(12);
    });

    it('should include required error codes', () => {
      expect(McpErrorCode.INVALID_DATE_RANGE).toBe('INVALID_DATE_RANGE');
      expect(McpErrorCode.INVALID_PARAMETER).toBe('INVALID_PARAMETER');
      expect(McpErrorCode.INSUFFICIENT_DATA).toBe('INSUFFICIENT_DATA');
      expect(McpErrorCode.INVALID_PERIOD).toBe('INVALID_PERIOD');
      expect(McpErrorCode.INVALID_SYMBOL).toBe('INVALID_SYMBOL');
      expect(McpErrorCode.ARRAY_LENGTH_MISMATCH).toBe('ARRAY_LENGTH_MISMATCH');
      expect(McpErrorCode.INDEX_NOT_FOUND).toBe('INDEX_NOT_FOUND');
      expect(McpErrorCode.DATA_NOT_FOUND).toBe('DATA_NOT_FOUND');
      expect(McpErrorCode.DATA_PARSE_ERROR).toBe('DATA_PARSE_ERROR');
      expect(McpErrorCode.INVALID_DATA_FORMAT).toBe('INVALID_DATA_FORMAT');
      expect(McpErrorCode.CALCULATION_ERROR).toBe('CALCULATION_ERROR');
      expect(McpErrorCode.INDICATOR_CALCULATION_FAILED).toBe(
        'INDICATOR_CALCULATION_FAILED',
      );
    });
  });

  describe('McpError', () => {
    it('should create error with message and code', () => {
      const error = new McpError(
        'Test error message',
        McpErrorCode.INVALID_SYMBOL,
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error message');
      expect(error.code).toBe(McpErrorCode.INVALID_SYMBOL);
      expect(error.name).toBe('McpError');
    });

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new McpError('Test error', McpErrorCode.INVALID_PARAMETER);
      }).toThrow(McpError);

      try {
        throw new McpError('Test error', McpErrorCode.INVALID_PERIOD);
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect(error).toBeInstanceOf(Error);
        if (error instanceof McpError) {
          expect(error.code).toBe(McpErrorCode.INVALID_PERIOD);
        }
      }
    });
  });

  describe('MCP_ERROR_RECOVERY', () => {
    it('should have recovery mapping for all error codes', () => {
      const errorCodes = Object.values(McpErrorCode);
      errorCodes.forEach((code) => {
        expect(MCP_ERROR_RECOVERY[code]).toBeDefined();
        expect(MCP_ERROR_RECOVERY[code]).toHaveProperty('suggestions');
        expect(Array.isArray(MCP_ERROR_RECOVERY[code].suggestions)).toBe(true);
        expect(MCP_ERROR_RECOVERY[code].suggestions.length).toBeGreaterThan(0);
      });
    });

    it('should provide suggestions for INSUFFICIENT_DATA', () => {
      const recovery = MCP_ERROR_RECOVERY[McpErrorCode.INSUFFICIENT_DATA];

      expect(recovery.suggestions).toContain(
        'Use get_kline_data to fetch more historical data',
      );
      expect(recovery.next_tool).toBeDefined();
      expect(recovery.next_tool?.name).toBe('get_kline_data');
    });

    it('should provide suggestions for INVALID_SYMBOL', () => {
      const recovery = MCP_ERROR_RECOVERY[McpErrorCode.INVALID_SYMBOL];

      expect(recovery.suggestions).toContain(
        'Use list_indices to get valid index symbols',
      );
      expect(recovery.next_tool).toBeDefined();
      expect(recovery.next_tool?.name).toBe('list_indices');
    });

    it('should provide suggestions for INVALID_PERIOD', () => {
      const recovery = MCP_ERROR_RECOVERY[McpErrorCode.INVALID_PERIOD];

      expect(recovery.suggestions).toContain(
        'Valid periods: 1min, 5min, 15min, 30min, 60min, daily',
      );
    });

    it('should provide suggestions for INVALID_DATE_RANGE', () => {
      const recovery = MCP_ERROR_RECOVERY[McpErrorCode.INVALID_DATE_RANGE];

      expect(recovery.suggestions).toContain(
        'Ensure the start date is before the end date',
      );
      expect(recovery.suggestions).toContain('Use ISO 8601 format: YYYY-MM-DD');
    });

    it('should provide suggestions for ARRAY_LENGTH_MISMATCH', () => {
      const recovery = MCP_ERROR_RECOVERY[McpErrorCode.ARRAY_LENGTH_MISMATCH];

      expect(recovery.suggestions).toContain(
        'Ensure all input arrays have the same length',
      );
    });

    it('should provide suggestions for INDEX_NOT_FOUND with next_tool', () => {
      const recovery = MCP_ERROR_RECOVERY[McpErrorCode.INDEX_NOT_FOUND];

      expect(recovery.suggestions).toContain(
        'Use list_indices to see all available indices',
      );
      expect(recovery.next_tool).toBeDefined();
      expect(recovery.next_tool?.name).toBe('list_indices');
    });

    it('should provide suggestions for DATA_NOT_FOUND with next_tool', () => {
      const recovery = MCP_ERROR_RECOVERY[McpErrorCode.DATA_NOT_FOUND];

      expect(recovery.next_tool).toBeDefined();
      expect(recovery.next_tool?.name).toBe('list_indices');
    });

    it('should provide suggestions for DATA_PARSE_ERROR', () => {
      const recovery = MCP_ERROR_RECOVERY[McpErrorCode.DATA_PARSE_ERROR];

      expect(recovery.suggestions).toContain('Check data format and structure');
    });

    it('should provide suggestions for INVALID_DATA_FORMAT', () => {
      const recovery = MCP_ERROR_RECOVERY[McpErrorCode.INVALID_DATA_FORMAT];

      expect(recovery.suggestions).toContain(
        'Verify input data matches the expected schema',
      );
    });

    it('should provide suggestions for CALCULATION_ERROR', () => {
      const recovery = MCP_ERROR_RECOVERY[McpErrorCode.CALCULATION_ERROR];

      expect(recovery.suggestions).toContain(
        'Check data quality for null or NaN values',
      );
    });

    it('should provide suggestions for INDICATOR_CALCULATION_FAILED', () => {
      const recovery =
        MCP_ERROR_RECOVERY[McpErrorCode.INDICATOR_CALCULATION_FAILED];

      expect(recovery.suggestions).toContain(
        'Try a different technical indicator',
      );
    });

    it('should have optional next_tool property', () => {
      const withNextTool = MCP_ERROR_RECOVERY[McpErrorCode.INVALID_SYMBOL];
      const withoutNextTool =
        MCP_ERROR_RECOVERY[McpErrorCode.INVALID_DATE_RANGE];

      expect(withNextTool.next_tool).toBeDefined();
      expect(withoutNextTool.next_tool).toBeUndefined();
    });

    it('should have next_tool with required properties when present', () => {
      const recovery = MCP_ERROR_RECOVERY[McpErrorCode.INSUFFICIENT_DATA];

      expect(recovery.next_tool).toBeDefined();
      expect(recovery.next_tool?.name).toBeDefined();
      expect(recovery.next_tool?.reason).toBeDefined();
      expect(typeof recovery.next_tool?.name).toBe('string');
      expect(typeof recovery.next_tool?.reason).toBe('string');
    });
  });
});
