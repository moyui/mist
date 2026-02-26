import { TimezoneModule } from '@app/timezone';
import { UtilsModule } from '@app/utils';
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndexData } from './entities/index-data.entitiy';
import { IndexDaily } from './entities/index-daily.entity';
import { IndexPeriod } from './entities/index-period.entity';
import { SharedDataService } from './shared-data.service';

@Module({
  imports: [
    TimezoneModule,
    UtilsModule,
    HttpModule,
    TypeOrmModule.forFeature([IndexData, IndexPeriod, IndexDaily]),
  ],
  providers: [SharedDataService],
  exports: [SharedDataService],
})
export class SharedDataModule {}
