import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecuritySourceConfig } from '@app/shared-data';
import { RealtimeSnapshotIngressService } from './realtime-snapshot-ingress.service';
import { RealtimeSecurityAllowlistService } from './realtime-security-allowlist.service';
import { Clock } from './clock.service';
import { RealtimeRedisService } from './realtime-redis.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SecuritySourceConfig])],
  providers: [
    RealtimeSnapshotIngressService,
    RealtimeSecurityAllowlistService,
    // B1 foundation: injectable clock + market-data Redis connection.
    Clock,
    RealtimeRedisService,
  ],
  exports: [
    RealtimeSnapshotIngressService,
    RealtimeSecurityAllowlistService,
    Clock,
    RealtimeRedisService,
  ],
})
export class RealtimeIngressModule {}
