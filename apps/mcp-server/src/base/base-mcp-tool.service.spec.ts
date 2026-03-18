import { BaseMcpToolService } from './base-mcp-tool.service';
import { McpError, McpErrorCode } from '@app/constants';

class TestMcpToolService extends BaseMcpToolService {
  constructor() {
    super(TestMcpToolService.name);
  }

  // Expose protected methods for testing
  public testSuccess<T>(data: T, meta?: Record<string, any>) {
    return this.success(data, meta);
  }

  public testError(message: string, code?: string) {
    return this.error(message, code);
  }

  public async testExecuteTool<T>(toolName: string, fn: () => Promise<T>) {
    return this.executeTool(toolName, fn);
  }
}

describe('BaseMcpToolService', () => {
  let service: TestMcpToolService;

  beforeEach(() => {
    service = new TestMcpToolService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(service['logger']).toBeDefined();
  });

  describe('success', () => {
    it('should return success response with data', () => {
      const result = service.testSuccess({ foo: 'bar' });

      expect(result).toEqual({
        success: true,
        data: { foo: 'bar' },
      });
    });

    it('should return success response with data and metadata', () => {
      const result = service.testSuccess({ foo: 'bar' }, { count: 1 });

      expect(result).toEqual({
        success: true,
        data: { foo: 'bar' },
        count: 1,
      });
    });
  });

  describe('error', () => {
    it('should return error response with message', () => {
      const result = service.testError('Something went wrong');

      expect(result).toEqual({
        success: false,
        error: {
          message: 'Something went wrong',
          code: undefined,
          suggestions: [],
          next_tool: undefined,
        },
      });
    });

    it('should return error response with message and code', () => {
      const result = service.testError('Not found', 'NOT_FOUND');

      expect(result).toEqual({
        success: false,
        error: {
          message: 'Not found',
          code: 'NOT_FOUND',
          suggestions: [],
          next_tool: undefined,
        },
      });
    });
  });

  describe('executeTool', () => {
    it('should execute tool and return success', async () => {
      const result = await service.testExecuteTool('test_tool', async () => {
        return { result: 'success' };
      });

      expect(result).toEqual({
        success: true,
        data: { result: 'success' },
      });
    });

    it('should handle errors and return error response', async () => {
      const result = (await service.testExecuteTool('test_tool', async () => {
        throw new Error('Tool failed');
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Tool failed');
      expect(result.error.code).toBeUndefined();
      expect(result.error.suggestions).toEqual([]);
      expect(result.error.next_tool).toBeUndefined();
    });

    it('should handle errors with code', async () => {
      const error = new Error('Validation failed') as any;
      error.code = 'VALIDATION_ERROR';

      const result = (await service.testExecuteTool('test_tool', async () => {
        throw error;
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Validation failed');
      // Note: Generic Error with code property is NOT extracted (only McpError is extracted)
      expect(result.error.code).toBeUndefined();
      expect(result.error.suggestions).toEqual([]);
      expect(result.error.next_tool).toBeUndefined();
    });
  });
});

describe('BaseMcpToolService - Error Recovery', () => {
  let service: TestMcpToolService;

  beforeEach(async () => {
    service = new TestMcpToolService();
  });

  describe('error() method', () => {
    it('should include recovery suggestions for known error codes', () => {
      const result = service.testError(
        'Not enough data',
        McpErrorCode.INSUFFICIENT_DATA,
      );

      expect(result.success).toBe(false);
      expect(result.error.suggestions).toBeDefined();
      expect(result.error.suggestions.length).toBeGreaterThan(0);
      expect(result.error.suggestions[0]).toContain('get_kline_data');
    });

    it('should include next_tool for errors with recovery actions', () => {
      const result = service.testError(
        'Index not found',
        McpErrorCode.INDEX_NOT_FOUND,
      );

      expect(result.success).toBe(false);
      expect(result.error.next_tool).toBeDefined();
      expect(result.error.next_tool?.name).toBe('list_indices');
      expect(result.error.next_tool?.reason).toContain('indices');
    });

    it('should return empty suggestions for unknown error codes', () => {
      const result = service.testError('Unknown error', 'UNKNOWN_CODE');

      expect(result.success).toBe(false);
      expect(result.error.suggestions).toEqual([]);
      expect(result.error.next_tool).toBeUndefined();
    });

    it('should preserve error message and code', () => {
      const result = service.testError('Test error', 'TEST_CODE');

      expect(result.error.message).toBe('Test error');
      expect(result.error.code).toBe('TEST_CODE');
    });
  });

  describe('executeTool() method', () => {
    it('should extract error code from McpError', async () => {
      const errorFn = async () => {
        throw new McpError('Not enough data', McpErrorCode.INSUFFICIENT_DATA);
      };

      const result = (await service.testExecuteTool(
        'test_tool',
        errorFn,
      )) as any;

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(McpErrorCode.INSUFFICIENT_DATA);
      expect(result.error.suggestions).toBeDefined();
    });

    it('should not extract code from generic Error', async () => {
      const errorFn = async () => {
        throw new Error('Generic error');
      };

      const result = (await service.testExecuteTool(
        'test_tool',
        errorFn,
      )) as any;

      expect(result.success).toBe(false);
      expect(result.error.code).toBeUndefined();
      expect(result.error.suggestions).toEqual([]);
    });
  });
});
