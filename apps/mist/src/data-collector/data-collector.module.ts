import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KLine } from '@app/shared-data';
import { Stock } from '../stock/stock.entity';
import { DataCollectorService } from './data-collector.service';
import { DataCollectorController } from './data-collector.controller';
import { EastMoneySource } from '../sources/east-money.source';
import { TdxSource } from '../sources/tdx.source';
import { StockService } from '../stock/stock.service';
import { UtilsModule } from '@app/utils';

@Module({
  imports: [TypeOrmModule.forFeature([KLine, Stock]), UtilsModule],
  controllers: [DataCollectorController],
  providers: [DataCollectorService, EastMoneySource, TdxSource, StockService],
  exports: [DataCollectorService],
})
export class DataCollectorModule {
  // The module can be extended to include specific fetcher implementations
  // when they are created in future tasks
}
