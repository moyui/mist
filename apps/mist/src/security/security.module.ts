import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  RealtimeSubscriptionAssignment,
  Security,
  SecuritySourceConfig,
} from '@app/shared-data';
import { SecurityService } from './security.service';
import { SecurityV1AliasController } from './security-v1-alias.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Security,
      SecuritySourceConfig,
      RealtimeSubscriptionAssignment,
    ]),
  ],
  controllers: [SecurityV1AliasController],
  providers: [SecurityService],
  exports: [SecurityService],
})
export class SecurityModule {}
