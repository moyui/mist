import { K, Security } from '@app/shared-data';
import { Module } from '@nestjs/common';
import { TimezoneModule } from '@app/timezone';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndicatorController } from './indicator.controller';
import { IndicatorService } from './indicator.service';

@Module({
  imports: [TypeOrmModule.forFeature([K, Security]), TimezoneModule],
  controllers: [IndicatorController],
  providers: [IndicatorService],
  exports: [IndicatorService],
})
export class IndicatorModule {}
