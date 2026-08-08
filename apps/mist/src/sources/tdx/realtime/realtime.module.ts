/**
 * TdxRealtimeModule — formal TDX realtime consumer.
 *
 * Imported by default; explicit TDX_REALTIME_MODE=off omits the whole module.
 * Contains the independent WS client, allowlist resolver, in-memory store, and
 * diagnostic controller.
 *
 * no-K static boundary: this module deliberately does NOT import
 * HistoricalCollectorModule (which carries K repositories and CollectorService).
 * It only imports Security/SecuritySourceConfig for the allowlist resolver.
 * No K aggregation, no DB K writes, no business side effects.
 */
import { Module } from '@nestjs/common';
import { TdxRealtimeStore } from './realtime.store';
import { TdxRealtimeAllowlistResolver } from './realtime-allowlist.resolver';
import { TdxRealtimeClient } from './realtime.client';
import { RealtimeIngressModule } from '../../../realtime/realtime-ingress.module';

@Module({
  // Only SecuritySourceConfig for the allowlist resolver.
  // Deliberately does NOT import K / KExtension* / HistoricalCollectorModule.
  imports: [RealtimeIngressModule],
  providers: [
    TdxRealtimeStore,
    TdxRealtimeAllowlistResolver,
    TdxRealtimeClient,
  ],
  controllers: [],
})
export class TdxRealtimeModule {}
