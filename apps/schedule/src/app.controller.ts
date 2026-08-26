import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('health')
@Controller('app')
export class AppController {
  @Get('hello')
  @ApiOperation({
    summary: 'Health check / liveness ping endpoint',
    description: 'Returns a greeting to verify the schedule service is running',
  })
  getHello(): string {
    return 'Hello World!';
  }
}
