import { Module } from '@nestjs/common';
import { UtilsModule } from '@app/utils';
import { TimezoneService } from './timezone.service';

@Module({
  imports: [UtilsModule],
  providers: [TimezoneService],
  exports: [TimezoneService],
})
export class TimezoneModule {}
