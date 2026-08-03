import { UtilsModule } from '@app/utils';
import { Module } from '@nestjs/common';
import { ChanController } from './chan.controller';
import { ChanService } from './chan.service';
import { IndicatorModule } from '../indicator/indicator.module';
import { TimezoneModule } from '@app/timezone';

@Module({
  imports: [UtilsModule, IndicatorModule, TimezoneModule],
  controllers: [ChanController],
  providers: [ChanService],
  exports: [ChanService],
})
export class ChanModule {}
