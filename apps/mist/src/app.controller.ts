import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AppService } from './app.service';

@ApiTags('health')
@Controller('app')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('hello')
  @Throttle({ default: { limit: 200, ttl: 60000 } }) // 200 requests per minute for health check
  @ApiOperation({
    summary: 'Health check endpoint',
    description: 'Returns a greeting to verify the service is running',
  })
  @ApiResponse({ status: 200, description: 'Service is healthy', type: String })
  getHello(): string {
    return this.appService.getHello();
  }
}
