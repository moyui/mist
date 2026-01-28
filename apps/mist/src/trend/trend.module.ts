import { UtilsModule } from '@app/utils';
import { Module } from '@nestjs/common';
import { TrendService } from './trend.service';

@Module({
  imports: [UtilsModule],
  providers: [TrendService],
  exports: [TrendService],
})
export class TrendModule {}
