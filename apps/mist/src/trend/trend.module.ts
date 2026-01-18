import { UtilsModule } from '@app/utils';
import { Module } from '@nestjs/common';
import { DataModule } from '../data/data.module';
import { TrendService } from './trend.service';

@Module({
  imports: [DataModule, UtilsModule],
  providers: [TrendService],
})
export class TrendModule {}
