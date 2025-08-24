import { Injectable } from '@nestjs/common';

@Injectable()
export class UtilsService {
  getLocalUrl(path: string) {
    return `http://127.0.0.1:3000/indicator/${path}`;
  }

  formatLocalResult<T>(result: T): string {
    return JSON.stringify(result, null, 2);
  }
}
