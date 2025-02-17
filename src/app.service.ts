import { Injectable } from '@nestjs/common';
import * as path from 'path';

@Injectable()
export class AppService {
  async loadNativeModule() {
    await import(path.resolve(__dirname, 'native', 'xxx.node'));
  }
  getHello(): string {
    return 'Hello World!';
  }
}
