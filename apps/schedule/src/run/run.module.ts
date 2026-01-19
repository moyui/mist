import { SharedDataModule } from '@app/shared-data';
import { UtilsModule } from '@app/utils';
import { Module } from '@nestjs/common';
import { TaskModule } from '../task/task.module';
import { RunController } from './run.controller';

@Module({
  imports: [TaskModule, UtilsModule, SharedDataModule],
  controllers: [RunController],
  providers: [],
})
export class RunModule {}
