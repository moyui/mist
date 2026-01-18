import { UtilsModule } from '@app/utils';
import { Module } from '@nestjs/common';
import { TrendModule } from '../trend/trend.module';
import { ChanController } from './chan.controller';
import { ChanService } from './chan.service';

@Module({
  imports: [TrendModule, UtilsModule],
  controllers: [ChanController],
  providers: [ChanService],
})
export class ChanModule {}
