import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { K, Security } from '@app/shared-data';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

@Module({
  imports: [TypeOrmModule.forFeature([K, Security])],
  controllers: [MarketDataController],
  providers: [MarketDataService],
  exports: [MarketDataService],
})
export class MarketDataModule {}
