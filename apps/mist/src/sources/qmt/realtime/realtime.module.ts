import { Module } from '@nestjs/common';
import { QmtRealtimeAllowlistResolver } from './realtime-allowlist.resolver';
import { QmtRealtimeClient } from './realtime.client';
import { QmtRealtimeStore } from './realtime.store';
import { RealtimeIngressModule } from '../../../realtime/realtime-ingress.module';

@Module({
  imports: [RealtimeIngressModule],
  providers: [
    QmtRealtimeAllowlistResolver,
    QmtRealtimeClient,
    QmtRealtimeStore,
  ],
  controllers: [],
})
export class QmtRealtimeModule {}
