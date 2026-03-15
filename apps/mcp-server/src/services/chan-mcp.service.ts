import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { ChanService } from '../../../mist/src/chan/chan.service';
import { ChannelService } from '../../../mist/src/chan/services/channel.service';

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
export class ChanMcpService {
  constructor(
    private readonly chanService: ChanService,
    private readonly channelService: ChannelService,
  ) {}

  @Tool({
    name: 'merge_k',
    description: '合并K线，基于包含关系和趋势方向将连续K线分组',
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
    description: '从K线数据中识别笔（Bi），基于缠论分型识别',
  })
  async createBi(k: z.infer<typeof KLineSchema>) {
    // Convert input data to KVo format
    const kVoData = k.map((kline) => ({
      ...kline,
      time: new Date(kline.time),
    }));

    const createBiDto = { k: kVoData };
    const result = await this.chanService.createBi(createBiDto);
    return {
      success: true,
      data: result,
      count: result.length,
    };
  }

  @Tool({
    name: 'get_fenxing',
    description: '获取所有分型（Fenxing），识别顶分型和底分型',
  })
  async getFenxing(k: z.infer<typeof KLineSchema>) {
    // Convert input data to KVo format
    const kVoData = k.map((kline) => ({
      ...kline,
      time: new Date(kline.time),
    }));

    const createBiDto = { k: kVoData };
    const result = await this.chanService.getFenxings(createBiDto);
    return {
      success: true,
      data: result,
      count: result.length,
    };
  }

  @Tool({
    name: 'analyze_chan_theory',
    description: '完整的缠论分析：合并K → 识别笔 → 识别分型 → 识别中枢',
  })
  async analyzeChanTheory(k: z.infer<typeof KLineSchema>) {
    // Convert input data to KVo format
    const kVoData = k.map((kline) => ({
      ...kline,
      time: new Date(kline.time),
    }));

    const createBiDto = { k: kVoData };

    // Step 1: Create Bi (this internally does merge K)
    const bis = await this.chanService.createBi(createBiDto);

    // Step 2: Get Fenxings
    const fenxings = await this.chanService.getFenxings(createBiDto);

    // Step 3: Create Channels from Bi
    const createChannelDto = { bi: bis };
    const channels = await this.channelService.createChannel(createChannelDto);

    return {
      success: true,
      data: {
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
      },
      summary: {
        originalKLines: k.length,
        bisCount: bis.length,
        fenxingsCount: fenxings.length,
        channelsCount: channels.length,
      },
    };
  }
}
