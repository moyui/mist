import {
  IndexDaily,
  IndexData,
  IndexPeriod,
  SharedDataModule,
} from '@app/shared-data';
import { TimezoneModule } from '@app/timezone';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataController } from './data.controller';
import { DataService } from './data.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    TypeOrmModule.forFeature([IndexData, IndexPeriod, IndexDaily]),
    TimezoneModule,
    SharedDataModule,
  ],
  controllers: [DataController],
  providers: [DataService],
  exports: [DataService],
})
export class DataModule {}
