import { Module } from '@nestjs/common';
import { ChanModule } from '../../mist/src/chan/chan.module';
import { TrendModule } from '../../mist/src/trend/trend.module';

@Module({
  imports: [ChanModule, TrendModule],
})
export class ChanAppModule {}
