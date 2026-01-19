import { Module } from '@nestjs/common';
import { DataModule } from '../data/data.module';
import { IndicatorController } from './indicator.controller';
import { IndicatorService } from './indicator.service';

@Module({
  imports: [DataModule],
  controllers: [IndicatorController],
  providers: [IndicatorService],
})
export class IndicatorModule {}
