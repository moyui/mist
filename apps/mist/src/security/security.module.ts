import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Security, SecuritySourceConfig } from '@app/shared-data';
import { SecurityService } from './security.service';
import { SecurityController } from './security.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Security, SecuritySourceConfig])],
  controllers: [SecurityController],
  providers: [SecurityService],
  exports: [],
})
export class SecurityModule {}
