import { TimezoneModule } from '@app/timezone';
import { UtilsModule } from '@app/utils';
import { Module } from '@nestjs/common';
import { SharedDataService } from './shared-data.service';

@Module({
  imports: [TimezoneModule, UtilsModule],
  providers: [SharedDataService],
  exports: [SharedDataService],
})
export class SharedDataModule {}
