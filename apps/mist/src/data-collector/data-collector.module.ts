import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { K, Security } from '@app/shared-data';
import { DataCollectorService } from './data-collector.service';
import { DataCollectorController } from './data-collector.controller';
import { EastMoneySource } from '../sources/east-money.source';
import { TdxSource } from '../sources/tdx.source';
import { UtilsModule } from '@app/utils';

@Module({
  imports: [TypeOrmModule.forFeature([K, Security]), UtilsModule],
  controllers: [DataCollectorController],
  providers: [DataCollectorService, EastMoneySource, TdxSource],
  exports: [DataCollectorService],
})
export class DataCollectorModule {
  // The module can be extended to include specific fetcher implementations
  // when they are created in future tasks
}
