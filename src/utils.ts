import {
  getHours,
  getMinutes,
  setHours,
  setMilliseconds,
  setMinutes,
  setSeconds,
} from 'date-fns';

/**
 * 将时间向下舍入到指定的分钟间隔，并清除秒和毫秒
 * @param date 需要舍入的时间
 * @param interval 时间间隔（分钟），例如 5、15、30、60
 * @returns 舍入后的时间
 */
export function roundDownToNearestInterval(date: Date, interval: number): Date {
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

/**
 * 日期前增加0
 * @param number number
 * @returns string
 */
export function addZeroToNumber(number: number): string {
  return (number > 10 ? number : '0' + number).toString();
}

/**
 * 获取当前时间
 * @returns Date
 */
export function getNowDate() {
  const now = new Date();
  return now;
}

export function formatIndicator(
  begIndex: number,
  index: number,
  data: number[],
) {
  if (index < begIndex) return NaN;
  return data[index - begIndex];
}
