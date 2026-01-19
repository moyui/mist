import { Injectable } from '@nestjs/common';
import {
  getHours,
  getMinutes,
  setHours,
  setMilliseconds,
  setMinutes,
  setSeconds,
} from 'date-fns';

@Injectable()
export class UtilsService {
  getLocalUrl(path: string) {
    return `http://127.0.0.1:3000/indicator/${path}`;
  }

  formatLocalResult<T>(result: T): string {
    return JSON.stringify(result, null, 2);
  }

  getLatestValidValue(values: number[]): number | null {
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] !== null && values[i] !== undefined && !isNaN(values[i])) {
        return values[i];
      }
    }
    return null;
  }

  findLastIndex<T>(
    array: T[],
    predicate: (value: T, index: number, array: T[]) => boolean,
    fromIndex?: number,
  ): number {
    const length = array.length;
    let startIndex: number;
    if (fromIndex === undefined) {
      startIndex = length - 1;
    } else {
      startIndex = Math.trunc(fromIndex);
      if (startIndex < 0) {
        startIndex = length + startIndex;
      }
      if (startIndex >= length) {
        startIndex = length - 1;
      } else if (startIndex < 0) {
        return -1;
      }
    }
    for (let i = startIndex; i >= 0; i--) {
      if (predicate(array[i], i, array)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 获取当前时间
   * @returns Date
   */
  getNowDate() {
    const now = new Date();
    return now;
  }

  /**
   * 日期前增加0
   * @param number number
   * @returns string
   */
  addZeroToNumber(number: number) {
    return (number > 10 ? number : '0' + number).toString();
  }

  /**
   * 将时间向下舍入到指定的分钟间隔，并清除秒和毫秒
   * @param date 需要舍入的时间
   * @param interval 时间间隔（分钟），例如 5、15、30、60
   * @returns 舍入后的时间
   */
  roundDownToNearestInterval(date: Date, interval: number): Date {
    if (interval <= 0) {
      throw new Error('时间间隔必须大于 0');
    }

    // 处理 1 小时的情况
    if (interval === 60) {
      const hours = getHours(date);
      return setSeconds(
        setMilliseconds(setHours(setMinutes(date, 0), hours), 0),
        0,
      ); // 舍入到整点并清除秒和毫秒
    }

    // 处理分钟级别的舍入
    const minutes = getMinutes(date);
    const roundedMinutes = Math.floor(minutes / interval) * interval;
    return setSeconds(setMilliseconds(setMinutes(date, roundedMinutes), 0), 0); // 舍入到指定间隔并清除秒和毫秒
  }
}
