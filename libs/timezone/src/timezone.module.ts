import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { UtilsModule } from '@app/utils';
import { TimezoneService } from './timezone.service';

@Module({
  imports: [UtilsModule, HttpModule],
  providers: [TimezoneService],
  exports: [TimezoneService],
})
export class TimezoneModule {}
