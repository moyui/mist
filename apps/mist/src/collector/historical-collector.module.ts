/**
 * HistoricalCollectorModule — historical K-line collection only.
 *
 * Polling strategies (EastMoney/TDX/QMT), CollectorService, the historical
 * CollectorController (only `POST /collect`). No realtime providers.
 *
 * Imported by both the mist app and the schedule app.
 */
import { Module, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  K,
  KExtensionEf,
  KExtensionQmt,
  KExtensionTdx,
  Security,
  SecuritySourceConfig,
} from '@app/shared-data';
import { CollectorService } from './collector.service';
import { CollectorController } from './collector.controller';
import { EastMoneyCollectionStrategy } from './strategies/east-money-collection.strategy';
import { TdxCollectionStrategy } from './strategies/tdx-collection.strategy';
import { QmtCollectionStrategy } from './strategies/qmt-collection.strategy';
import { EastMoneySource } from '../sources/east-money/east-money-source.service';
import { QmtSource } from '../sources/qmt/qmt-source.service';
import { TdxSource } from '../sources/tdx/tdx-source.service';
import { UtilsModule } from '@app/utils';
import { SecurityModule } from '../security/security.module';
import { TimezoneModule } from '@app/timezone';
import {
  COLLECTION_STRATEGIES,
  CollectionStrategyRegistry,
} from './strategies/collection-strategy.registry';

export const COLLECTION_STRATEGIES_PROVIDER: Provider = {
  provide: COLLECTION_STRATEGIES,
  useFactory: (
    eastMoney: EastMoneyCollectionStrategy,
    tdx: TdxCollectionStrategy,
    qmt: QmtCollectionStrategy,
  ) => [eastMoney, tdx, qmt],
  inject: [
    EastMoneyCollectionStrategy,
    TdxCollectionStrategy,
    QmtCollectionStrategy,
  ],
};

@Module({
  imports: [
    TypeOrmModule.forFeature([
      K,
      KExtensionEf,
      KExtensionTdx,
      KExtensionQmt,
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
    TdxCollectionStrategy,
    QmtCollectionStrategy,
    EastMoneySource,
    TdxSource,
    QmtSource,
    COLLECTION_STRATEGIES_PROVIDER,
    CollectionStrategyRegistry,
  ],
  controllers: [CollectorController],
  exports: [
    CollectorService,
    EastMoneyCollectionStrategy,
    TdxCollectionStrategy,
    QmtCollectionStrategy,
    CollectionStrategyRegistry,
  ],
})
export class HistoricalCollectorModule {}
