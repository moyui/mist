import { BaseMcpToolService } from './base-mcp-tool.service';

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
    });

    it('should handle errors with code', async () => {
      const error = new Error('Validation failed') as any;
      error.code = 'VALIDATION_ERROR';

      const result = (await service.testExecuteTool('test_tool', async () => {
        throw error;
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Validation failed');
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
