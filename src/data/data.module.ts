import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { DataController } from './data.controller';
import { DataService } from './data.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  controllers: [DataController],
  providers: [DataService],
})
export class DataModule {}
