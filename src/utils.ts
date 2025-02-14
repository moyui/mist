import { setMinutes, getMinutes, setHours, getHours } from 'date-fns';

/**
 * 将时间向下舍入到指定的分钟间隔
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
    return setHours(setMinutes(date, 0), hours); // 舍入到整点
  }

  // 处理分钟级别的舍入
  const minutes = getMinutes(date);
  const roundedMinutes = Math.floor(minutes / interval) * interval;
  return setMinutes(date, roundedMinutes);
}
