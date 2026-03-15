import { Injectable, Logger } from '@nestjs/common';
import { MCPTool, MCPToolParam } from '@rekog/mcp-nest';
import { KMergeService } from '../../mist/src/chan/services/k-merge.service';
import { BiService } from '../../mist/src/chan/services/bi.service';
import { ChannelService } from '../../mist/src/chan/services/channel.service';
import { CreateBiDto } from '../../mist/src/chan/dto/create-bi.dto';
import { CreateChannelDto } from '../../mist/src/chan/dto/create-channel.dto';

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
  private readonly logger = new Logger(ChanMcpService.name);

  constructor(
    private readonly kMergeService: KMergeService,
    private readonly biService: BiService,
    private readonly channelService: ChannelService,
  ) {}

  /**
   * Merge K-lines based on containment relationships and trend direction
   *
   * @param k - Array of K-line data with time, open, close, highest, lowest, volume, price
   * @returns Merged K-line data
   */
  @MCPTool('merge_k', '合并K线，基于包含关系和趋势方向将连续K线分组')
  async mergeK(
    @MCPToolParam('k', 'K线数据数组', 'array')
    k: Array<{
      time: string;
      open: number;
      close: number;
      highest: number;
      lowest: number;
      volume: number;
      price: number;
    }>,
  ) {
    this.logger.debug(`Merging ${k.length} K-lines`);
    const result = await this.kMergeService.merge(k);
    this.logger.debug(`Merged into ${result.length} K-lines`);
    return {
      success: true,
      data: result,
      count: result.length,
    };
  }

  /**
   * Create Bi (strokes) from K-line data using Chan Theory
   *
   * @param k - Array of K-line data
   * @returns Array of Bi data with trend, start/end points, and price levels
   */
  @MCPTool('create_bi', '从K线数据中识别笔（Bi），基于缠论分型识别')
  async createBi(
    @MCPToolParam('k', 'K线数据数组', 'array')
    k: Array<{
      id: number;
      time: string;
      open: number;
      close: number;
      highest: number;
      lowest: number;
      volume: number;
      price: number;
    }>,
  ) {
    this.logger.debug(`Creating Bi from ${k.length} K-lines`);
    const createBiDto: CreateBiDto = { k };
    const result = await this.biService.createBi(createBiDto);
    this.logger.debug(`Created ${result.length} Bis`);
    return {
      success: true,
      data: result,
      count: result.length,
    };
  }

  /**
   * Get all Fenxing (fractals) from merged K-lines
   *
   * @param k - Array of K-line data
   * @returns Array of fenxing data (top and bottom patterns)
   */
  @MCPTool('get_fenxing', '获取所有分型（Fenxing），识别顶分型和底分型')
  async getFenxing(
    @MCPToolParam('k', 'K线数据数组', 'array')
    k: Array<{
      id: number;
      time: string;
      open: number;
      close: number;
      highest: number;
      lowest: number;
      volume: number;
      price: number;
    }>,
  ) {
    this.logger.debug(`Getting Fenxings from ${k.length} K-lines`);
    const createBiDto: CreateBiDto = { k };
    const result = await this.biService.getFenxings(createBiDto);
    this.logger.debug(`Found ${result.length} Fenxings`);
    return {
      success: true,
      data: result,
      count: result.length,
    };
  }

  /**
   * Create Channels (Zhongshu/中枢) from Bi data
   *
   * @param bis - Array of Bi data
   * @returns Array of channel data with zg, zd, and extension info
   */
  @MCPTool('create_channel', '从笔（Bi）数据中识别中枢（Channel/Zhongshu）')
  async createChannel(
    @MCPToolParam('bis', '笔（Bi）数据数组', 'array')
    bis: Array<{
      id: number;
      trend: string;
      startId: number;
      endId: number;
      highest: number;
      lowest: number;
    }>,
  ) {
    this.logger.debug(`Creating channels from ${bis.length} Bis`);
    const createChannelDto: CreateChannelDto = { bis };
    const result = await this.channelService.createChannel(createChannelDto);
    this.logger.debug(`Created ${result.length} channels`);
    return {
      success: true,
      data: result,
      count: result.length,
    };
  }

  /**
   * Perform complete Chan Theory analysis (Merge K → Bi → Channel)
   *
   * @param k - Array of K-line data
   * @returns Complete analysis with merged K, Bis, Fenxings, and Channels
   */
  @MCPTool(
    'analyze_chan_theory',
    '完整的缠论分析：合并K → 识别笔 → 识别分型 → 识别中枢',
  )
  async analyzeChanTheory(
    @MCPToolParam('k', 'K线数据数组', 'array')
    k: Array<{
      id: number;
      time: string;
      open: number;
      close: number;
      highest: number;
      lowest: number;
      volume: number;
      price: number;
    }>,
  ) {
    this.logger.log(
      `Starting complete Chan Theory analysis for ${k.length} K-lines`,
    );

    // Step 1: Merge K
    const mergedK = await this.kMergeService.merge(k);
    this.logger.debug(
      `Step 1: Merged ${k.length} K-lines into ${mergedK.length}`,
    );

    // Step 2: Create Bi from merged K
    const createBiDto: CreateBiDto = { k: mergedK };
    const bis = await this.biService.createBi(createBiDto);
    this.logger.debug(`Step 2: Created ${bis.length} Bis`);

    // Step 3: Get Fenxings
    const fenxings = await this.biService.getFenxings(createBiDto);
    this.logger.debug(`Step 3: Found ${fenxings.length} Fenxings`);

    // Step 4: Create Channels
    const createChannelDto: CreateChannelDto = { bis };
    const channels = await this.channelService.createChannel(createChannelDto);
    this.logger.debug(`Step 4: Created ${channels.length} channels`);

    this.logger.log(
      `Chan Theory analysis completed: ${channels.length} channels identified`,
    );

    return {
      success: true,
      data: {
        mergedK: {
          count: mergedK.length,
          data: mergedK,
        },
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
        mergedKLines: mergedK.length,
        bisCount: bis.length,
        fenxingsCount: fenxings.length,
        channelsCount: channels.length,
      },
    };
  }
}
