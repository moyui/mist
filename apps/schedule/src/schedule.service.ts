import { Injectable } from '@nestjs/common';

@Injectable()
export class ScheduleService {
  getHello(): string {
    return 'Hello World!';
  }
}
