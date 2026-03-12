import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateChannelDto } from '../dto/create-channel.dto';
import { ChannelLevel, ChannelType } from '../enums/channel.enum';
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

  private hasOverlapWithChannel(bi: BiVo, zg: number, zd: number) {
    return bi.lowest <= zg && bi.highest >= zd;
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

  private checkOverlapRange(bis: BiVo[]) {
    if (bis.length < 3) {
      return null;
    }
    const highests = bis.map((bi) => bi.highest);
    const lowests = bis.map((bi) => bi.lowest);

    const zg = Math.min(...highests);
    const zd = Math.max(...lowests);
    // 无重叠
    if (zd >= zg) return null;
    const allOverlap = bis.every((bi) =>
      this.hasOverlapWithChannel(bi, zg, zd),
    );
    // 每笔重叠区间
    if (!allOverlap) return null;
    return [zg, zd];
  }

  private getStrictChannel(bis: BiVo[], overlapRange: number[]): ChannelVo {
    const resultBis = bis.slice(0, 3);
    return {
      zg: overlapRange[0],
      zd: overlapRange[1],
      gg: Math.max(...resultBis.map((bi) => bi.highest)),
      dd: Math.min(...resultBis.map((bi) => bi.lowest)),
      bis: resultBis,
      level: ChannelLevel.Bi, // 目前都是笔中枢，后续可能有段中枢
      type: ChannelType.Complete, // 目前是完成的中枢
      startId: bis[0].originIds[0],
      endId:
        bis[bis.length - 1].originIds[bis[bis.length - 1].originIds.length - 1],
      trend: bis[0].trend, // 中枢方向就是进入第一笔的方向
    };
  }

  // 处理严格中枢状态
  private handleStrictChannelState(bis: BiVo[]): ChannelVo | null {
    if (bis.length < 3) {
      return null;
    }
    // 检查笔的方向是否交替
    if (!this.isTrendAlternating(bis)) {
      return null;
    }
    // 检查前3笔是否重叠
    const overlapRange = this.checkOverlapRange(bis.slice(0, 3));
    if (!overlapRange) {
      return null;
    }

    const channel = this.getStrictChannel(bis, overlapRange);
    return channel;
  }

  private recalculateChannel(channel: ChannelVo, bis: BiVo[]): ChannelVo {
    return {
      ...channel,
      bis: [...channel.bis, ...bis],
      gg: Math.max(channel.gg, ...bis.map((bi) => bi.highest)),
      dd: Math.min(channel.dd, ...bis.map((bi) => bi.lowest)),
    };
  }

  /**
   * 重新计算中枢，追加新的bis（不重复原有的）
   * 注意：延伸中枢时，zg和zd保持不变，只更新gg和dd
   * 这是缠论的正确逻辑 - 延伸的笔应该"保护"原有的zg-zd重叠区间
   */
  private recalculateChannelWithNewBis(
    channel: ChannelVo,
    newBis: BiVo[],
  ): ChannelVo {
    // 延伸时zg和zd保持不变，只更新gg和dd
    // 原因：zg-zd是核心重叠区间，延伸的笔应该保护这个区间，而不是改变它
    const newGg = Math.max(channel.gg, ...newBis.map((bi) => bi.highest));
    const newDd = Math.min(channel.dd, ...newBis.map((bi) => bi.lowest));

    return {
      ...channel,
      bis: [...channel.bis, ...newBis],
      gg: newGg,
      dd: newDd,
    };
  }

  // 处理扩展中枢状态
  private handleExtendChannelState(
    channel: ChannelVo,
    bis: BiVo[],
  ): { channel: ChannelVo; offsetIndex: number } {
    if (bis.length === 0) return { channel, offsetIndex: 0 };
    const extendedBis: BiVo[] = [];
    let i = 0;
    for (i; i < bis.length; i++) {
      const hasOverlap = this.hasOverlapWithChannel(
        bis[i],
        channel.zg,
        channel.zd,
      );
      if (hasOverlap) {
        extendedBis.push(bis[i]);
      } else {
        break; // 如果一旦没有出现重叠，那么延伸处理结束
      }
    }
    if (extendedBis.length === 0) return { channel, offsetIndex: 0 };
    // 如果最后一笔的方向和起始笔是一样的，说明最后一笔无法构成一个正常中枢，需要进行处理
    // 这里就需要判断是笔是否用完了
    if (extendedBis[extendedBis.length - 1].trend === channel.bis[0].trend) {
      if (i === bis.length) {
        // 笔用完了，判断成中枢结构未完
        return {
          channel: {
            ...channel,
            type: ChannelType.UnComplete,
          },
          offsetIndex: i,
        };
      } else {
        // 笔未用完，最后一笔为新中枢的起始段，不属于原有中枢
        const newExtendedBis = [...extendedBis];
        newExtendedBis.pop();
        return {
          channel: this.recalculateChannelWithNewBis(channel, newExtendedBis),
          offsetIndex: i - 1,
        };
      }
    } else {
      return {
        channel: this.recalculateChannelWithNewBis(channel, extendedBis),
        offsetIndex: i,
      };
    }
  }

  /**
   * 获取中枢
   * @param data
   * @returns
   */
  private getChannel(data: BiVo[]) {
    // 中枢要至少3笔才能形成，所以使用滑动窗口方案
    const channels: ChannelVo[] = [];
    const biCount = data.length;
    if (biCount < 3) {
      return { channels, offsetIndex: 0 };
    }
    let i = 0;
    for (i; i <= biCount - 3; i++) {
      const threeBis = data.slice(i, i + 3);
      // 生成严格中枢
      const channel = this.handleStrictChannelState(threeBis);
      // 如果没有找到channel, 尝试下次迭代
      if (!channel) continue;
      // 处理中枢扩展，如果存在后续笔的情况
      if (i + 3 < biCount) {
        const remainBis = data.slice(i + 3);
        const { channel: extendedChannel, offsetIndex } =
          this.handleExtendChannelState(channel, remainBis);
        i = i + offsetIndex;
        channels.push(extendedChannel);
      } else {
        channels.push(channel);
      }
    }
    return { channels, offsetIndex: i };
  }
}
