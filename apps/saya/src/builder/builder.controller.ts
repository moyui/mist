import { Body, Controller, Post } from '@nestjs/common';
import { BuilderService } from './builder.service';
import { InvokeDto } from './dto/invoke.dto';

@Controller('builder')
export class BuilderController {
  constructor(private readonly builderService: BuilderService) {}

  @Post('invoke')
  async invoke(@Body() InvokeDto: InvokeDto): Promise<any> {
    return this.builderService.invoke(InvokeDto.message);
  }
}
