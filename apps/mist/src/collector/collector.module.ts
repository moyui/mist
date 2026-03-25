import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { K, Security, SecuritySourceConfig } from '@app/shared-data';
import { CollectorService } from './collector.service';
import { DataCollectionScheduler } from './data-collection.scheduler';
import { EastMoneySource } from '../sources/east-money.source';
import { TdxSource } from '../sources/tdx.source';
import { UtilsModule } from '@app/utils';

@Module({
  imports: [
    TypeOrmModule.forFeature([K, Security, SecuritySourceConfig]),
    UtilsModule,
  ],
  providers: [
    CollectorService,
    DataCollectionScheduler,
    EastMoneySource,
    TdxSource,
  ],
  exports: [CollectorService, DataCollectionScheduler],
})
export class CollectorModule {
  // The module can be extended to include specific fetcher implementations
  // when they are created in future tasks
}
