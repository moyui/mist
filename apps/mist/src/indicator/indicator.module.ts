import { Module } from '@nestjs/common';

import { DataModule } from 'src/data/data.module';
import { TimezoneModule } from 'src/timezone/timezone.module';
import { IndicatorController } from './indicator.controller';
import { IndicatorService } from './indicator.service';

@Module({
  imports: [DataModule, TimezoneModule],
  controllers: [IndicatorController],
  providers: [IndicatorService],
})
export class IndicatorModule {}
