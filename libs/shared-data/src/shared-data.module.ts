import { TimezoneModule } from '@app/timezone';
import { UtilsModule } from '@app/utils';
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { K } from './entities/k.entity';
import { Security } from './entities/security.entity';
import { SecuritySourceConfig } from './entities/security-source-config.entity';
import { SharedDataService } from './shared-data.service';

@Module({
  imports: [
    TimezoneModule,
    UtilsModule,
    HttpModule,
    TypeOrmModule.forFeature([K, Security, SecuritySourceConfig]),
  ],
  providers: [SharedDataService],
  exports: [SharedDataService],
})
export class SharedDataModule {}
