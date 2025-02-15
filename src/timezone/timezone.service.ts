import { Injectable } from '@nestjs/common';
import {
  addMinutes,
  format as dateFnsFormat,
  format,
  isWithinInterval,
} from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { addZeroToNumber, roundDownToNearestInterval } from 'src/utils';

@Injectable()
export class TimezoneService {
  convertToBeijingTimeWithInterval(
    date: Date,
    sourceTimeZone: string,
    interval: number,
  ): { format: string; date: Date } {
    // 将原始时间转换为 UTC 时间
    const utcTime = fromZonedTime(date, sourceTimeZone);
    // 将 UTC 时间转换为北京时间
    const beijingTime = toZonedTime(utcTime, 'Asia/Shanghai');
    // 将时间向下舍入到指定间隔
    const roundedTime = roundDownToNearestInterval(beijingTime, interval);
    // 格式化时间为 yyyy-MM-dd HH:mm:ss
    return {
      format: dateFnsFormat(roundedTime, 'yyyy-MM-dd HH:mm:ss'),
      date: roundedTime,
    };
  }

  private generateTimeSlotsPart(
    startTime: Date,
    endTime: Date,
    intervalMinutes: number,
    year: string,
    month: string,
    date: string,
    isBefore: boolean,
  ): string[][] {
    const timeSlots: string[][] = [];
    let currentTime = startTime;

    // 定义需要排除的时间段
    const excludeStart = new Date(`${year}-${month}-${date}T11:30:00`);
    const excludeEnd = new Date(`${year}-${month}-${date}T13:00:00`);

    // 根据 intervalMinutes 动态计算需要保留的时间段
    const keepStart = isBefore
      ? new Date(`${year}-${month}-${date}T11:30:00`)
      : new Date(`${year}-${month}-${date}T15:00:00`);
    const keepEnd = addMinutes(keepStart, intervalMinutes);

    while (currentTime <= endTime) {
      const nextTime = addMinutes(currentTime, intervalMinutes);

      // 检查当前时间段是否在排除的时间段内
      const isExcluded = isBefore
        ? isWithinInterval(currentTime, {
            start: excludeStart,
            end: excludeEnd,
          }) ||
          isWithinInterval(nextTime, { start: excludeStart, end: excludeEnd })
        : false; // 如果是后置时间则不需要排除

      // 检查当前时间段是否是需要保留的时间段
      const isKept =
        format(currentTime, 'yyyy-MM-dd HH:mm:ss') ===
          format(keepStart, 'yyyy-MM-dd HH:mm:ss') &&
        format(nextTime, 'yyyy-MM-dd HH:mm:ss') ===
          format(keepEnd, 'yyyy-MM-dd HH:mm:ss');

      // 如果不在排除的时间段内，或者是需要保留的时间段，则添加到结果中
      if (!isExcluded || isKept) {
        timeSlots.push([
          format(currentTime, 'yyyy-MM-dd HH:mm:ss'),
          format(nextTime, 'yyyy-MM-dd HH:mm:ss'),
        ]);
      }

      currentTime = nextTime;
    }

    return timeSlots;
  }

  generateTimeSlots(
    startTime: Date,
    endTime: Date,
    intervalMinutes: number,
  ): string[][] {
    const year = startTime.getFullYear().toString();
    const month = addZeroToNumber(startTime.getMonth() + 1);
    const date = startTime.getDate().toString();

    const beforePart = new Date(`${year}-${month}-${date}T11:30:00`);
    const beforePartEnd = addMinutes(beforePart, intervalMinutes); // 11:35，11:45，12:00
    const afterPartStart = new Date(`${year}-${month}-${date}T13:00:00`);

    const beforeTime = this.generateTimeSlotsPart(
      startTime,
      beforePartEnd,
      intervalMinutes,
      year,
      month,
      date,
      true,
    );

    const afterTime = this.generateTimeSlotsPart(
      afterPartStart,
      endTime,
      intervalMinutes,
      year,
      month,
      date,
      false,
    );

    return beforeTime.concat(afterTime);
  }
}
