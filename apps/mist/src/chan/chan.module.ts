import { UtilsModule } from '@app/utils';
import { Module } from '@nestjs/common';
import { TrendModule } from '../trend/trend.module';
import { ChanController } from './chan.controller';
import { ChanService } from './chan.service';
import { BiService } from './services/bi.service';
import { ChannelService } from './services/channel.service';
import { KMergeService } from './services/k-merge.service';

@Module({
  imports: [TrendModule, UtilsModule],
  controllers: [ChanController],
  providers: [ChanService, ChannelService, BiService, KMergeService],
})
export class ChanModule {}
