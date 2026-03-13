import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateChannelDto } from '../dto/create-channel.dto';
import { ChannelLevel, ChannelType } from '../enums/channel.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiVo } from '../vo/bi.vo';
import { ChannelVo } from '../vo/channel.vo';

@Injectable()
export class ChannelService {
  // 画中枢
  createChannel(createChannelDto: CreateChannelDto): ChannelVo[] {
    this.validateInput(createChannelDto);
    this.validateBiIntegrity(createChannelDto.bi);
    const { channels } = this.getChannel(createChannelDto.bi);
    return channels;
  }

  private validateInput(createChannelDto: CreateChannelDto): void {
    if (!createChannelDto || !createChannelDto.bi) {
      throw new HttpException(
        'Invalid input: bi data is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!Array.isArray(createChannelDto.bi)) {
      throw new HttpException(
        'Invalid input: bi must be an array',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (createChannelDto.bi.length === 0) {
      throw new HttpException(
        'Invalid input: bi array cannot be empty',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate each bi has required fields
    for (let i = 0; i < createChannelDto.bi.length; i++) {
      const bi = createChannelDto.bi[i];
      if (!bi.highest || !bi.lowest) {
        throw new HttpException(
          `Invalid bi at index ${i}: missing highest or lowest value`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (typeof bi.highest !== 'number' || typeof bi.lowest !== 'number') {
        throw new HttpException(
          `Invalid bi at index ${i}: highest and lowest must be numbers`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (bi.highest <= bi.lowest) {
        throw new HttpException(
          `Invalid bi at index ${i}: highest must be greater than lowest`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  private validateBiIntegrity(bis: BiVo[]): void {
    for (let i = 0; i < bis.length; i++) {
      const bi = bis[i];
      const isLastBi = i === bis.length - 1;

      // 最后一笔可以是未完成的（endFenxing 为 null）
      if (isLastBi && !bi.endFenxing) {
        continue;
      }

      // 其他笔必须有完整的 startFenxing 和 endFenxing
      if (!bi.startFenxing || !bi.endFenxing) {
        throw new HttpException(
          `第 ${i + 1} 笔数据不完整：缺少分型信息`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  private isTrendAlternating(bis: BiVo[]) {
    for (let i = 0; i < bis.length - 1; i++) {
      if (bis[i].trend === bis[i + 1].trend) {
        return false;
      }
    }
    return true;
  }

  /**
   * 验证笔的趋势是否交替
   */
  private validateTrendAlternating(bis: BiVo[]): boolean {
    for (let i = 0; i < bis.length - 1; i++) {
      if (bis[i].trend === bis[i + 1].trend) {
        return false;
      }
    }
    return true;
  }

  /**
   * 验证前3笔是否有重叠区域（zg > zd）
   * @returns { valid: boolean, zg?: number; zd?: number }
   */
  private validateZgZdOverlap(bis: BiVo[]): {
    valid: boolean;
    zg?: number;
    zd?: number;
  } {
    if (bis.length < 3) {
      return { valid: false };
    }

    const zg = Math.min(bis[0].highest, bis[1].highest, bis[2].highest);
    const zd = Math.max(bis[0].lowest, bis[1].lowest, bis[2].lowest);

    if (zg <= zd) {
      return { valid: false };
    }

    return { valid: true, zg, zd };
  }

  /**
   * 验证笔是否与中枢区间重叠
   */
  private validateBiOverlap(bi: BiVo, zg: number, zd: number): boolean {
    return bi.lowest <= zg && bi.highest >= zd;
  }

  /**
   * 验证第4、5笔是否与zg-zd重叠
   */
  private validateFiveBiOverlap(
    fiveBis: BiVo[],
    zg: number,
    zd: number,
  ): boolean {
    return (
      this.validateBiOverlap(fiveBis[3], zg, zd) &&
      this.validateBiOverlap(fiveBis[4], zg, zd)
    );
  }

  /**
   * 检查笔是否与中枢区间重叠
   * @param bi 笔数据
   * @param zg 中枢高
   * @param zd 中枢低
   * @returns 是否重叠
   */
  private hasOverlap(bi: BiVo, zg: number, zd: number): boolean {
    // 基本重叠检查：笔的低点 ≤ zg 且笔的高点 ≥ zd
    return bi.lowest <= zg && bi.highest >= zd;
  }

  /**
   * 计算 zg-zd（中枢高低点）
   * zg = 前 3 笔的最低高点
   * zd = 前 3 笔的最高低点
   * @param bis 笔数组（至少 3 笔）
   * @returns [zg, zd] 或 null（无重叠）
   */
  private calculateZgZd(bis: BiVo[]): [number, number] | null {
    if (bis.length < 3) {
      return null;
    }

    // zg = 前 3 笔的最低高点
    const zg = Math.min(bis[0].highest, bis[1].highest, bis[2].highest);

    // zd = 前 3 笔的最高低点
    const zd = Math.max(bis[0].lowest, bis[1].lowest, bis[2].lowest);

    // 检查是否有重叠
    if (zg <= zd) {
      return null;
    }

    return [zg, zd];
  }

  /**
   * 检测 5-bi 中枢
   * @param fiveBis 笔数组（至少 5 笔）
   * @param originalBis 原始完整笔数组（用于获取正确的 ID）
   * @param startIndex 起始索引
   * @returns 中枢对象或 null
   */
  private detectChannel(
    fiveBis: BiVo[],
    originalBis: BiVo[],
    startIndex: number,
  ): ChannelVo | null {
    if (fiveBis.length < 5) {
      return null;
    }

    // 验证1：检查趋势是否交替
    if (!this.validateTrendAlternating(fiveBis)) {
      return null;
    }

    // 验证2：从前3笔计算zg-zd
    const zgZdResult = this.validateZgZdOverlap(fiveBis);
    if (
      !zgZdResult.valid ||
      zgZdResult.zg === undefined ||
      zgZdResult.zd === undefined
    ) {
      return null;
    }
    const { zg, zd } = zgZdResult;

    // 验证3：检查第4、5笔是否与zg-zd重叠
    if (!this.validateFiveBiOverlap(fiveBis, zg, zd)) {
      return null;
    }

    // 计算gg-dd并创建中枢对象
    const initialFiveBis = fiveBis.slice(0, 5);
    const gg = Math.max(...initialFiveBis.map((bi) => bi.highest));
    const dd = Math.min(...initialFiveBis.map((bi) => bi.lowest));

    // 创建中枢对象
    return {
      bis: [...initialFiveBis],
      zg: zg,
      zd: zd,
      gg: gg,
      dd: dd,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      startId: originalBis[startIndex].originIds[0],
      endId:
        originalBis[startIndex + 4].originIds[
          originalBis[startIndex + 4].originIds.length - 1
        ],
      trend: fiveBis[0].trend,
    };
  }

  /**
   * 计算初始极值
   * 向上中枢：极值 = max(Bi1.highest, Bi3.highest, Bi5.highest)
   * 向下中枢：极值 = min(Bi1.lowest, Bi3.lowest, Bi5.lowest)
   * @param channel 中枢对象
   * @returns 初始极值
   */
  private calculateInitialExtreme(channel: ChannelVo): number {
    const channelTrend = channel.trend;
    let extreme: number;

    if (channelTrend === TrendDirection.Up) {
      extreme = Math.max(
        channel.bis[0].highest,
        channel.bis[2].highest,
        channel.bis[4].highest,
      );
    } else {
      extreme = Math.min(
        channel.bis[0].lowest,
        channel.bis[2].lowest,
        channel.bis[4].lowest,
      );
    }

    return extreme;
  }

  /**
   * 检查笔是否超过极值
   * 向上笔：highest > currentExtreme → 超过
   * 向下笔：lowest < currentExtreme → 超过
   * @param bi 笔数据
   * @param extreme 当前极值
   * @param trend 趋势方向
   * @returns 是否超过极值
   */
  private exceedsExtreme(
    bi: BiVo,
    extreme: number,
    trend: TrendDirection,
  ): boolean {
    if (trend === TrendDirection.Up) {
      return bi.highest > extreme;
    } else {
      return bi.lowest < extreme;
    }
  }

  /**
   * 更新极值
   * 向上中枢：取 max(extreme, bi.highest)
   * 向下中枢：取 min(extreme, bi.lowest)
   * @param bi 笔数据
   * @param extreme 当前极值
   * @param trend 趋势方向
   * @returns 新的极值
   */
  private updateExtreme(
    bi: BiVo,
    extreme: number,
    trend: TrendDirection,
  ): number {
    if (trend === TrendDirection.Up) {
      return Math.max(extreme, bi.highest);
    } else {
      return Math.min(extreme, bi.lowest);
    }
  }

  /**
   * 延伸中枢
   * @param channel 原始中枢
   * @param remainingBis 剩余笔数组
   * @returns 延伸后的中枢和使用的笔数
   */
  private extendChannel(
    channel: ChannelVo,
    remainingBis: BiVo[],
  ): { channel: ChannelVo; usedCount: number } {
    if (remainingBis.length === 0) {
      return { channel, usedCount: 0 };
    }

    const pendingBis: BiVo[] = []; // 暂存区：等待奇数笔确认的偶数笔
    const confirmedBis: BiVo[] = []; // 确认区：已确认加入中枢的笔
    let currentExtreme = this.calculateInitialExtreme(channel);

    // 计算突破阈值（zg-zd区间大小的1%，至少为1）
    const breakoutThreshold = Math.max(1, (channel.zg - channel.zd) * 0.01);

    for (let i = 0; i < remainingBis.length; i++) {
      const bi = remainingBis[i];
      // 计算当前笔的编号（5笔基础中枢 + 已确认笔 + 暂存笔 + 当前笔）
      const biNumber =
        channel.bis.length + confirmedBis.length + pendingBis.length + 1;

      // 检查价格突破（方案1）：中枢的破坏条件
      // 向上突破：笔的低点 > zg（整个区间都在zg之上）
      // 向下突破：笔的高点 < zd（整个区间都在zd之下）
      if (bi.lowest > channel.zg || bi.highest < channel.zd) {
        break; // 价格突破，中枢结束
      }

      // 检查趋势突破（方案3）：结合趋势方向的突破检测，使用百分比阈值
      // 向上中枢：如果向上笔的低点跌破zd超过阈值，或向下笔的高点跌破zg超过阈值
      // 向下中枢：如果向下笔的高点突破zg超过阈值，或向上笔的低点突破zd超过阈值
      if (channel.trend === TrendDirection.Up) {
        // 向上中枢的破坏条件：
        // 1. 向上笔低点跌破zd超过阈值（正常震荡时，向上笔的低点应该在zd附近或之上）
        // 2. 向下笔高点跌破zg超过阈值（正常震荡时，向下笔的高点应该在zg附近或之下）
        if (bi.trend === TrendDirection.Up) {
          // 向上笔：低点大幅跌破zd
          if (channel.zd - bi.lowest > breakoutThreshold) {
            break;
          }
        } else {
          // 向下笔：高点大幅跌破zg
          if (channel.zg - bi.highest > breakoutThreshold) {
            break;
          }
        }
      } else {
        // 向下中枢的破坏条件：
        // 1. 向下笔高点突破zg超过阈值（正常震荡时，向下笔的高点应该在zg附近或之下）
        // 2. 向上笔低点突破zd超过阈值（正常震荡时，向上笔的低点应该在zd附近或之上）
        if (bi.trend === TrendDirection.Down) {
          // 向下笔：高点大幅突破zg
          if (bi.highest - channel.zg > breakoutThreshold) {
            break;
          }
        } else {
          // 向上笔：低点大幅突破zd
          if (bi.lowest - channel.zd < -breakoutThreshold) {
            break;
          }
        }
      }

      // 检查重叠
      if (!this.hasOverlap(bi, channel.zg, channel.zd)) {
        break; // 没有重叠，中枢结束
      }

      const isOddNumbered = biNumber >= 6 && biNumber % 2 === 1; // 第7、9笔...

      if (isOddNumbered) {
        // 奇数笔（第7、9笔...）：检查极值
        if (this.exceedsExtreme(bi, currentExtreme, channel.trend)) {
          // ✅ 奇数笔成功：将暂存的偶数笔 + 当前奇数笔都确认
          confirmedBis.push(...pendingBis, bi);
          pendingBis.length = 0; // 清空暂存区
          currentExtreme = this.updateExtreme(
            bi,
            currentExtreme,
            channel.trend,
          );
        } else {
          // ❌ 奇数笔失败：暂存的偶数笔丢弃，中枢彻底结束
          break;
        }
      } else {
        // 偶数笔（第6、8笔...）：先暂存，等待奇数笔确认
        pendingBis.push(bi);
      }
    }

    // 只返回确认的笔（暂存区中的笔被丢弃）
    if (confirmedBis.length > 0) {
      const newBis = [...channel.bis, ...confirmedBis];
      const newGg = Math.max(channel.gg, ...confirmedBis.map((b) => b.highest));
      const newDd = Math.min(channel.dd, ...confirmedBis.map((b) => b.lowest));

      return {
        channel: {
          ...channel,
          bis: newBis,
          gg: newGg,
          dd: newDd,
          endId: confirmedBis[confirmedBis.length - 1].originIds[0],
        },
        usedCount: confirmedBis.length,
      };
    }

    return { channel, usedCount: 0 };
  }

  /**
   * 检查两个中枢是否有时间重叠
   * @param channel1 中枢1
   * @param channel2 中枢2
   * @returns 是否有时间重叠
   */
  private hasTimeOverlap(channel1: ChannelVo, channel2: ChannelVo): boolean {
    // 安全地获取时间戳，处理 Date 对象或字符串
    const getTime = (date: Date | string): number => {
      if (date instanceof Date) {
        return date.getTime();
      }
      return new Date(date).getTime();
    };

    const start1 = getTime(channel1.bis[0].startTime);
    const end1 = getTime(channel1.bis[channel1.bis.length - 1].endTime);
    const start2 = getTime(channel2.bis[0].startTime);
    const end2 = getTime(channel2.bis[channel2.bis.length - 1].endTime);

    // 检查时间区间是否重叠
    return start1 <= end2 && end1 >= start2;
  }

  /**
   * 验证中枢内部笔是否在有效范围内
   *
   * 下降中枢：内部笔应该在 [结束笔.lowest, 首笔.highest] 范围内
   * 上升中枢：内部笔应该在 [首笔.lowest, 结束笔.highest] 范围内
   *
   * @param channel 中枢对象
   * @returns 是否满足范围条件
   */
  private validateChannelRange(channel: ChannelVo): boolean {
    if (channel.bis.length < 3) {
      return false;
    }

    const firstBi = channel.bis[0];
    const lastBi = channel.bis[channel.bis.length - 1];

    // 检查所有内部笔（第2笔到倒数第2笔）
    for (let i = 1; i < channel.bis.length - 1; i++) {
      const bi = channel.bis[i];

      if (channel.trend === TrendDirection.Down) {
        // 下降中枢：内部笔应该在 [结束笔.lowest, 首笔.highest] 范围内
        if (bi.highest > firstBi.highest || bi.lowest < lastBi.lowest) {
          return false;
        }
      } else {
        // 上升中枢：内部笔应该在 [首笔.lowest, 结束笔.highest] 范围内
        if (bi.highest > lastBi.highest || bi.lowest < firstBi.lowest) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 验证起笔和结束笔的极值关系
   *
   * 上升中枢：结束笔.highest > 起笔.highest 且 结束笔.lowest > 起笔.lowest
   * 下降中枢：结束笔.highest < 起笔.highest 且 结束笔.lowest < 起笔.lowest
   *
   * @param channel 中枢对象
   * @returns 是否满足极值条件
   */
  private validateExtremeCondition(channel: ChannelVo): boolean {
    const firstBi = channel.bis[0];
    const lastBi = channel.bis[channel.bis.length - 1];

    if (channel.trend === TrendDirection.Up) {
      // 上升中枢：结束笔的极值应该大于起笔的极值
      return lastBi.highest > firstBi.highest && lastBi.lowest > firstBi.lowest;
    } else {
      // 下降中枢：结束笔的极值应该小于起笔的极值
      return lastBi.highest < firstBi.highest && lastBi.lowest < firstBi.lowest;
    }
  }

  /**
   * 合并重叠的中枢（保留笔数少的）
   * @param channels 中枢数组
   * @returns 合并后的中枢数组
   */
  private mergeOverlappingChannels(channels: ChannelVo[]): ChannelVo[] {
    const result: ChannelVo[] = [];

    for (const current of channels) {
      const overlapIndex = result.findIndex((existing) =>
        this.hasTimeOverlap(existing, current),
      );

      if (overlapIndex === -1) {
        // 无重叠，直接添加
        result.push(current);
      } else {
        // 有重叠，保留笔数少的（更精确）
        if (current.bis.length < result[overlapIndex].bis.length) {
          result[overlapIndex] = current;
        }
      }
    }

    return result;
  }

  /**
   * 获取中枢
   * @param data 笔数组
   * @returns 中枢数组和偏移索引
   */
  private getChannel(data: BiVo[]) {
    const channels: ChannelVo[] = [];
    const biCount = data.length;

    if (biCount < 5) {
      return { channels, offsetIndex: 0 };
    }

    // 滑动窗口检测所有 5-bi 中枢
    for (let i = 0; i <= biCount - 5; i++) {
      const channel = this.detectChannel(data.slice(i), data, i);

      if (!channel) {
        continue;
      }

      // 尝试延伸中枢
      const remainingBis = data.slice(i + 5);
      const { channel: extendedChannel } = this.extendChannel(
        channel,
        remainingBis,
      );

      // 检查第一笔和最后一笔的极值关系
      // 向上中枢：第一笔的highest < 最后一笔的highest
      // 向下中枢：第一笔的lowest > 最后一笔的lowest
      const firstBi = extendedChannel.bis[0];
      const lastBi = extendedChannel.bis[extendedChannel.bis.length - 1];

      let satisfiesExtremeCondition = false;
      if (extendedChannel.trend === TrendDirection.Up) {
        satisfiesExtremeCondition = firstBi.highest < lastBi.highest;
      } else {
        satisfiesExtremeCondition = firstBi.lowest > lastBi.lowest;
      }

      // 只有满足极值条件的中枢才添加到列表
      if (satisfiesExtremeCondition) {
        channels.push(extendedChannel);
      }
      // 如果不满足条件，丢弃这个中枢，继续从下一笔开始检测
    }

    // 合并重叠的中枢（保留笔数少的）
    const mergedChannels = this.mergeOverlappingChannels(channels);

    return { channels: mergedChannels, offsetIndex: biCount };
  }
}
