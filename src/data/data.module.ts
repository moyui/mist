import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskService } from 'src/task/task.service';
import { TimezoneService } from 'src/timezone/timezone.service';
import { DataController } from './data.controller';
import { DataService } from './data.service';
import { IndexData } from './entities/index-data.entitiy';
import { IndexPeriod } from './entities/index-period.entity';

@Module({
  imports: [
    TaskService,
    TimezoneService,
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    TypeOrmModule.forFeature([IndexData, IndexPeriod]),
  ],
  controllers: [DataController],
  providers: [DataService],
  exports: [DataService],
})
export class DataModule {}
