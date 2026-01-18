import { Injectable } from '@nestjs/common';

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
}
