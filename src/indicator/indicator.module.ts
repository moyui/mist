import { Module } from '@nestjs/common';
import { IndicatorService } from './indicator.service';
import { IndicatorController } from './indicator.controller';

@Module({
  controllers: [IndicatorController],
  providers: [IndicatorService],
})
export class IndicatorModule {}
