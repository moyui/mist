import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AxiosError } from 'axios';
import {
  addMinutes,
  format,
  fromUnixTime,
  isWithinInterval,
  millisecondsToSeconds,
} from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { catchError, firstValueFrom } from 'rxjs';
import {
  addZeroToNumber,
  getNowDate,
  roundDownToNearestInterval,
} from '../utils';

@Injectable()
export class TimezoneService {
  private readonly logger = new Logger();

  @Inject()
  private httpService: HttpService;

  convertToBeijingTimeWithInterval(
    date: Date,
    sourceTimeZone: string,
    interval: number,
  ): Date {
    // 将原始时间转换为 UTC 时间
    const utcTime = fromZonedTime(date, sourceTimeZone);
    // 将 UTC 时间转换为北京时间
    const beijingTime = toZonedTime(utcTime, 'Asia/Shanghai');
    // 将时间向下舍入到指定间隔
    const roundedTime = roundDownToNearestInterval(beijingTime, interval);
    // 格式化时间为 yyyy-MM-dd HH:mm:ss
    return roundedTime;
  }

  convertToBeijingTimeInDaily(date: Date, sourceTimeZone: string) {
    const utcTime = fromZonedTime(date, sourceTimeZone);
    // 将 UTC 时间转换为北京时间
    const beijingTime = toZonedTime(utcTime, 'Asia/Shanghai');
    return beijingTime;
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

  // 判断当前时间是否在对应时间段内
  isInTime1Min(now: Date) {
    const nowDate = getNowDate();
    const year = nowDate.getFullYear();
    const month = addZeroToNumber(nowDate.getMonth() + 1);
    const date = addZeroToNumber(nowDate.getDate());
    // 1分钟级别从9:32开始，到11:31结束
    return (
      isWithinInterval(now, {
        start: new Date(`${year}-${month}-${date}T09:32:00`),
        end: new Date(`${year}-${month}-${date}T11:31:00`),
      }) ||
      isWithinInterval(now, {
        start: new Date(`${year}-${month}-${date}T13:01:00`),
        end: new Date(`${year}-${month}-${date}T15:01:00`),
      })
    );
  }

  isInTime5Min(now: Date) {
    const nowDate = getNowDate();
    const year = nowDate.getFullYear();
    const month = addZeroToNumber(nowDate.getMonth() + 1);
    const date = addZeroToNumber(nowDate.getDate());
    return (
      isWithinInterval(now, {
        start: new Date(`${year}-${month}-${date}T09:36:00`),
        end: new Date(`${year}-${month}-${date}T11:31:00`),
      }) ||
      isWithinInterval(now, {
        start: new Date(`${year}-${month}-${date}T13:06:00`),
        end: new Date(`${year}-${month}-${date}T15:01:00`),
      })
    );
  }

  isInTime15Min(now: Date) {
    const nowDate = getNowDate();
    const year = nowDate.getFullYear();
    const month = addZeroToNumber(nowDate.getMonth() + 1);
    const date = addZeroToNumber(nowDate.getDate());
    return (
      isWithinInterval(now, {
        start: new Date(`${year}-${month}-${date}T09:36:00`),
        end: new Date(`${year}-${month}-${date}T11:31:00`),
      }) ||
      isWithinInterval(now, {
        start: new Date(`${year}-${month}-${date}T13:16:00`),
        end: new Date(`${year}-${month}-${date}T15:01:00`),
      })
    );
  }

  isInTime30Min(now: Date) {
    const nowDate = getNowDate();
    const year = nowDate.getFullYear();
    const month = addZeroToNumber(nowDate.getMonth() + 1);
    const date = addZeroToNumber(nowDate.getDate());
    return (
      isWithinInterval(now, {
        start: new Date(`${year}-${month}-${date}T10:01:00`),
        end: new Date(`${year}-${month}-${date}T11:31:00`),
      }) ||
      isWithinInterval(now, {
        start: new Date(`${year}-${month}-${date}T13:31:00`),
        end: new Date(`${year}-${month}-${date}T15:01:00`),
      })
    );
  }

  convertTimestamp2Date(timestamp: number) {
    return fromUnixTime(millisecondsToSeconds(timestamp));
  }

  async isTradingDay(date: Date): Promise<boolean> {
    const { data } = await firstValueFrom(
      this.httpService
        .get<{ data: { zrxh: number; jybz: string; jyrq: string }[] }>(
          'http://www.szse.cn/api/report/exchange/onepersistenthour/monthList',
          {
            params: {
              yearMonth: format(date, 'yyyy-MM'),
            },
          },
        )
        .pipe(
          catchError((error: AxiosError) => {
            this.logger.error(error.response.data, TimezoneService);
            throw new HttpException(
              '请求当前是否是交易时间错误',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        ),
    );
    const tradingDay = data.data?.find(
      (day) => day.jyrq === format(date, 'yyyy-MM-dd') && day.jybz === '1',
    );
    return !!tradingDay;
  }
}
