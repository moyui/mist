import { Controller, Get } from '@nestjs/common';
import { DataService } from './data.service';
import { GetIndexDto } from './dto/get-index.dto';

@Controller('data')
export class DataController {
  constructor(private readonly dataService: DataService) {
    this.dataService.initData();
  }

  @Get('index')
  async index() {
    const test: GetIndexDto = {
      symbol: '000001',
      period: 5,
      startDate: '2025-02-12 09:30:00',
      endDate: '2025-02-12 11:30:00',
    };
    return await this.dataService.getIndex(test);
  }
}
