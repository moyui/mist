import { Module } from '@nestjs/common';
import { TimezoneController } from './timezone.controller';
import { TimezoneService } from './timezone.service';

@Module({
  controllers: [TimezoneController],
  providers: [TimezoneService],
  exports: [TimezoneService],
})
export class TimezoneModule {}
