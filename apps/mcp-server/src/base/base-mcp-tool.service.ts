import { Logger } from '@nestjs/common';

/**
 * Base class for MCP tool services
 *
 * Provides common functionality for all MCP tools:
 * - Unified response formats
 * - Error handling
 * - Logging
 * - Tool execution wrapper
 */
export abstract class BaseMcpToolService {
  protected readonly logger: Logger;

  constructor(name: string) {
    this.logger = new Logger(name);
  }

  /**
   * Unified success response format
   */
  protected success<T>(
    data: T,
    meta?: Record<string, any>,
  ): { success: true; data: T } & Record<string, any> {
    return {
      success: true as const,
      data,
      ...meta,
    };
  }

  /**
   * Unified error response format (following MCP protocol)
   */
  protected error(
    message: string,
    code?: string,
  ): { success: false; error: { message: string; code?: string } } {
    return {
      success: false as const,
      error: {
        message,
        code,
      },
    };
  }

  /**
   * Wrapper for tool execution with automatic logging and error handling
   *
   * @param toolName - Name of the tool being executed
   * @param fn - Async function to execute
   * @returns Formatted success or error response
   */
  protected async executeTool<T>(
    toolName: string,
    fn: () => Promise<T>,
  ): Promise<
    | { success: true; data: T }
    | { success: false; error: { message: string; code?: string } }
  > {
    this.logger.debug(`Executing tool: ${toolName}`);
    try {
      const result = await fn();
      this.logger.debug(`Tool ${toolName} completed successfully`);
      return this.success(result);
    } catch (error) {
      this.logger.error(`Tool ${toolName} failed:`, error.message);
      return this.error(error.message, error.code);
    }
  }
}
