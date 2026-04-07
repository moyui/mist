import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  K,
  KExtensionEf,
  KExtensionTdx,
  Security,
  SecuritySourceConfig,
} from '@app/shared-data';
import { CollectorService } from './collector.service';
import { CollectorController } from './collector.controller';
import { EastMoneyCollectionStrategy } from './strategies/east-money-collection.strategy';
import { EastMoneySource } from '../sources/east-money/east-money-source.service';
import { TdxSource } from '../sources/tdx/tdx-source.service';
import { TdxWebSocketService } from '../sources/tdx/tdx-websocket.service';
import { KCandleAggregator } from '../sources/tdx/kcandle-aggregator';
import { UtilsModule } from '@app/utils';
import { SecurityModule } from '../security/security.module';
import { TimezoneModule } from '@app/timezone';
import {
  COLLECTION_STRATEGIES,
  CollectionStrategyRegistry,
} from './strategies/collection-strategy.registry';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      K,
      KExtensionEf,
      KExtensionTdx,
      Security,
      SecuritySourceConfig,
    ]),
    UtilsModule,
    SecurityModule,
    TimezoneModule,
  ],
  providers: [
    CollectorService,
    EastMoneyCollectionStrategy,
    EastMoneySource,
    TdxSource,
    KCandleAggregator,
    TdxWebSocketService,
    {
      provide: COLLECTION_STRATEGIES,
      useFactory: (eastMoney: EastMoneyCollectionStrategy) => [eastMoney],
      inject: [EastMoneyCollectionStrategy],
    },
    CollectionStrategyRegistry,
  ],
  controllers: [CollectorController],
  exports: [CollectorService, EastMoneyCollectionStrategy],
})
export class CollectorModule {}
