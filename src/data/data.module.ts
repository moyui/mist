import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskModule } from 'src/task/task.module';
import { TimezoneModule } from 'src/timezone/timezone.module';
import { DataController } from './data.controller';
import { DataService } from './data.service';
import { IndexData } from './entities/index-data.entitiy';
import { IndexPeriod } from './entities/index-period.entity';
import { IndexDaily } from './entities/index-daily.entity';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    TypeOrmModule.forFeature([IndexData, IndexPeriod, IndexDaily]),
    TaskModule,
    TimezoneModule,
  ],
  controllers: [DataController],
  providers: [DataService],
  exports: [DataService],
})
export class DataModule {}
