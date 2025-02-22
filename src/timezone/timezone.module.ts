import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TimezoneController } from './timezone.controller';
import { TimezoneService } from './timezone.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  controllers: [TimezoneController],
  providers: [TimezoneService],
  exports: [TimezoneService],
})
export class TimezoneModule {}
