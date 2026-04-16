import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { parseISO } from 'date-fns';
import { ChanService } from '../../../mist/src/chan/chan.service';
import { ChannelService } from '../../../mist/src/chan/services/channel.service';
import { McpErrorCode, McpError } from '@app/constants';
import { BaseMcpToolService } from '../base/base-mcp-tool.service';
import { ValidationHelper } from '../utils/validation.helpers';

/**
 * Zod schema for K-line data (matching KVo type)
 * Note: In practice, MCP clients will send dates as ISO strings, which we'll convert to Date objects
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const KLineSchema = z.array(
  z.object({
    id: z.number(),
    symbol: z.string(),
    time: z.string(), // Will be converted to Date in the service
    amount: z.number(),
    open: z.number(),
    close: z.number(),
    highest: z.number(),
    lowest: z.number(),
  }),
);

/**
 * MCP Service for Chan Theory (缠论) Analysis
 *
 * Provides tools for:
 * - Merge K (合并K): Groups consecutive K-lines based on containment relationships
 * - Bi (笔): Identifies significant price movements (trend lines)
 * - Channel (中枢): Identifies consolidation zones
 */
@Injectable()
export class ChanMcpService extends BaseMcpToolService {
  constructor(
    private readonly chanService: ChanService,
    private readonly channelService: ChannelService,
  ) {
    super(ChanMcpService.name);
  }

  /**
   * Map validation error messages to error codes
   */
  private getValidationErrorCode(errorMsg: string): McpErrorCode {
    if (
      errorMsg.includes('must contain at least') ||
      errorMsg.includes('elements')
    ) {
      return McpErrorCode.INSUFFICIENT_DATA;
    }
    return McpErrorCode.INVALID_PARAMETER;
  }

  @Tool({
    name: 'merge_k',
    description: `Merge consecutive K-lines based on containment relationships.

PURPOSE: Groups K-lines to reduce noise while preserving price action.
Preprocessing step for Chan Theory analysis.

WHEN TO USE: DO NOT use directly. Use analyze_chan_theory instead.

NOTE: Low-level operation. Use 'analyze_chan_theory' for complete analysis.`,
  })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async mergeK(_k: z.infer<typeof KLineSchema>) {
    // Note: merge_k is not directly exposed by ChanService
    // Users should use analyze_chan_theory for complete analysis
    // For now, we'll return a not implemented message
    return {
      success: false,
      error:
        'merge_k is not directly available. Please use analyze_chan_theory for complete Chan Theory analysis.',
    };
  }

  @Tool({
    name: 'create_bi',
    description: `Identify Bi (笔) - significant price movements in Chan Theory.

PURPOSE: Detects trend lines by identifying consecutive top/bottom patterns.

WHEN TO USE: Identifying trends, support/resistance, and pivot points.
REQUIRES: Array of K-line objects. Min 3 K-lines, 5+ recommended.
RETURNS: Bi array with times, prices, direction (UP/DOWN), status, and patterns.`,
  })
  async createBi(k: z.infer<typeof KLineSchema>) {
    return this.executeTool('create_bi', async () => {
      // Validate minimum K-line data (at least 3 K-lines needed for Bi detection)
      const minLengthError = ValidationHelper.validateMinLength(
        k,
        3,
        'K-line data',
      );
      if (minLengthError) {
        throw new McpError(
          minLengthError +
            ' Bi detection requires at least 3 K-lines to identify patterns.',
          this.getValidationErrorCode(minLengthError),
        );
      }

      // Convert input data to KVo format
      const kVoData = k.map((kline) => ({
        ...kline,
        time: parseISO(kline.time),
      }));

      const createBiDto = { k: kVoData };
      const result = await this.chanService.createBi(createBiDto);
      return {
        data: result,
        count: result.length,
      };
    });
  }

  @Tool({
    name: 'get_fenxing',
    description: `Identify Fenxing (分型) - top and bottom patterns in Chan Theory.

PURPOSE: Detects local tops and bottoms, foundational for trend lines.

WHEN TO USE: Finding price extremes, pivot points, and reversals.
REQUIRES: Array of K-line objects. Min 3 K-lines (middle + two neighbors).
RETURNS: Fenxing array with type (TOP/BOTTOM), time, prices, and index.`,
  })
  async getFenxing(k: z.infer<typeof KLineSchema>) {
    return this.executeTool('get_fenxing', async () => {
      // Validate minimum K-line data (at least 3 K-lines needed for Fenxing detection)
      const minLengthError = ValidationHelper.validateMinLength(
        k,
        3,
        'K-line data',
      );
      if (minLengthError) {
        throw new McpError(
          minLengthError +
            ' Fenxing detection requires at least 3 K-lines to identify patterns.',
          this.getValidationErrorCode(minLengthError),
        );
      }

      // Convert input data to KVo format
      const kVoData = k.map((kline) => ({
        ...kline,
        time: parseISO(kline.time),
      }));

      const createBiDto = { k: kVoData };
      const result = await this.chanService.getFenxings(createBiDto);
      return {
        data: result,
        count: result.length,
      };
    });
  }

  @Tool({
    name: 'analyze_chan_theory',
    description: `Complete Chan Theory analysis in one call.

PURPOSE: Full analysis including K-line merge, Bi, Fenxing, and Channel.

WHEN TO USE: Complete analysis, identifying trends and pivot points.

REQUIRES: Array of K-line objects. Min 3 K-lines, 50+ recommended.

RETURNS: Object with bis, fenxings, channels arrays, and summary.`,
  })
  async analyzeChanTheory(k: z.infer<typeof KLineSchema>) {
    return this.executeTool('analyze_chan_theory', async () => {
      // Validate minimum K-line data (at least 3 K-lines needed for Chan Theory analysis)
      const minLengthError = ValidationHelper.validateMinLength(
        k,
        3,
        'K-line data',
      );
      if (minLengthError) {
        throw new McpError(
          minLengthError +
            ' Chan Theory analysis requires at least 3 K-lines to identify patterns.',
          this.getValidationErrorCode(minLengthError),
        );
      }

      // Convert input data to KVo format
      const kVoData = k.map((kline) => ({
        ...kline,
        time: parseISO(kline.time),
      }));

      const createBiDto = { k: kVoData };

      // Step 1: Create Bi (this internally does merge K)
      const bis = await this.chanService.createBi(createBiDto);

      // Step 2: Get Fenxings
      const fenxings = await this.chanService.getFenxings(createBiDto);

      // Step 3: Create Channels from Bi
      const createChannelDto = { bi: bis };
      const channels =
        await this.channelService.createChannel(createChannelDto);

      return {
        bis: {
          count: bis.length,
          data: bis,
        },
        fenxings: {
          count: fenxings.length,
          data: fenxings,
        },
        channels: {
          count: channels.length,
          data: channels,
        },
        summary: {
          originalKLines: k.length,
          bisCount: bis.length,
          fenxingsCount: fenxings.length,
          channelsCount: channels.length,
        },
      };
    });
  }
}
