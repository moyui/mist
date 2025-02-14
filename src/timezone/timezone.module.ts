import { Module } from '@nestjs/common';
import { TimezoneService } from './timezone.service';
import { TimezoneController } from './timezone.controller';

@Module({
  controllers: [TimezoneController],
  providers: [TimezoneService],
})
export class TimezoneModule {}
