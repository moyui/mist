import { Logger } from '@nestjs/common';
import { MCP_ERROR_RECOVERY, McpError, McpErrorCode } from '@app/constants';

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
   *
   * Enhanced with recovery suggestions to help AI agents handle errors gracefully.
   * When a code is provided, looks up recovery suggestions from MCP_ERROR_RECOVERY.
   */
  protected error(
    message: string,
    code?: string,
  ): {
    success: false;
    error: {
      message: string;
      code?: string;
      suggestions: string[];
      next_tool?: {
        name: string;
        reason: string;
        params?: Record<string, any>;
      };
    };
  } {
    // Look up recovery suggestions if code is provided
    const recovery = code
      ? MCP_ERROR_RECOVERY[code as McpErrorCode]
      : undefined;

    return {
      success: false as const,
      error: {
        message,
        code,
        suggestions: recovery?.suggestions || [],
        next_tool: recovery?.next_tool,
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
    | {
        success: false;
        error: {
          message: string;
          code?: string;
          suggestions: string[];
          next_tool?: {
            name: string;
            reason: string;
            params?: Record<string, any>;
          };
        };
      }
  > {
    this.logger.debug(`Executing tool: ${toolName}`);
    try {
      const result = await fn();
      this.logger.debug(`Tool ${toolName} completed successfully`);
      return this.success(result);
    } catch (error) {
      this.logger.error(`Tool ${toolName} failed:`, error.message);

      // Extract error code if this is a McpError
      const errorCode = error instanceof McpError ? error.code : undefined;

      return this.error(error.message, errorCode);
    }
  }
}
