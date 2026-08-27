import { Module } from '@nestjs/common';
import { TimezoneModule } from '@app/timezone';
import { VisualCommandService } from '@app/visual-command';
import { IndicatorModule } from '../indicator/indicator.module';
import { VisualController } from './visual.controller';

@Module({
  imports: [IndicatorModule, TimezoneModule],
  controllers: [VisualController],
  providers: [VisualCommandService],
  exports: [VisualCommandService],
})
export class VisualModule {}
