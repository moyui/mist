import { Injectable } from '@nestjs/common';

@Injectable()
export class SayaService {
  getHello(): string {
    return 'Hello World!';
  }
}
