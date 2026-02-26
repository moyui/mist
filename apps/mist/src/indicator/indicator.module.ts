import { Module } from '@nestjs/common';
import { TimezoneModule } from '@app/timezone';
import { DataModule } from '../data/data.module';
import { IndicatorController } from './indicator.controller';
import { IndicatorService } from './indicator.service';

@Module({
  imports: [DataModule, TimezoneModule],
  controllers: [IndicatorController],
  providers: [IndicatorService],
})
export class IndicatorModule {}
