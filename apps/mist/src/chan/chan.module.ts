import { UtilsModule } from '@app/utils';
import { Module } from '@nestjs/common';
import { ChanController } from './chan.controller';
import { ChanService } from './chan.service';
import { BiService } from './services/bi.service';
import { ChannelService } from './services/channel.service';
import { KMergeService } from './services/k-merge.service';
import { TrendService } from './services/trend.service';

@Module({
  imports: [UtilsModule],
  controllers: [ChanController],
  providers: [
    ChanService,
    ChannelService,
    BiService,
    KMergeService,
    TrendService,
  ],
  exports: [
    ChanService,
    ChannelService,
    BiService,
    KMergeService,
    TrendService,
  ],
})
export class ChanModule {}
