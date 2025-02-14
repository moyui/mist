import { Injectable } from '@nestjs/common';
import { format as dateFnsFormat } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { roundDownToNearestInterval } from 'src/utils';

@Injectable()
export class TimezoneService {
  convertToBeijingTimeWithInterval(
    date: Date,
    sourceTimeZone: string,
    interval: number,
  ): string {
    // 将原始时间转换为 UTC 时间
    const utcTime = fromZonedTime(date, sourceTimeZone);
    // 将 UTC 时间转换为北京时间
    const beijingTime = toZonedTime(utcTime, 'Asia/Shanghai');
    // 将时间向下舍入到指定间隔
    const roundedTime = roundDownToNearestInterval(beijingTime, interval);
    // 格式化时间为 yyyy-MM-dd HH:mm:ss
    return dateFnsFormat(roundedTime, 'yyyy-MM-dd HH:mm:ss');
  }
}
