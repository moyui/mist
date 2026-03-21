import { KController } from './k.controller';
import { KService } from './k.service';
import { K, Security } from '@app/shared-data';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

@Module({
  imports: [TypeOrmModule.forFeature([K, Security])],
  controllers: [KController],
  providers: [KService],
  exports: [KService],
})
export class KModule {}
