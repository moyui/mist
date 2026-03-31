import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  K,
  KExtensionEf,
  Security,
  SecuritySourceConfig,
} from '@app/shared-data';
import { CollectorService } from './collector.service';
import { CollectorController } from './collector.controller';
import { EastMoneyCollectionStrategy } from './strategies/east-money-collection.strategy';
import { EastMoneySource } from '../sources/east-money.source';
import { TdxSource } from '../sources/tdx.source';
import { UtilsModule } from '@app/utils';
import { SecurityModule } from '../security/security.module';
import { TimezoneModule } from '@app/timezone';
import {
  COLLECTION_STRATEGIES,
  CollectionStrategyRegistry,
} from './strategies/collection-strategy.registry';

@Module({
  imports: [
    TypeOrmModule.forFeature([K, KExtensionEf, Security, SecuritySourceConfig]),
    UtilsModule,
    SecurityModule,
    TimezoneModule,
  ],
  providers: [
    CollectorService,
    EastMoneyCollectionStrategy,
    EastMoneySource,
    TdxSource,
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
