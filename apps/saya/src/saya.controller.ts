import { Controller, Get } from '@nestjs/common';
import { SayaService } from './saya.service';

@Controller()
export class SayaController {
  constructor(private readonly sayaService: SayaService) {}

  @Get()
  getHello(): string {
    return this.sayaService.getHello();
  }
}
