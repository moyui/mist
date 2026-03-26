import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecuritySourceConfig } from '@app/shared-data';
import { UtilsService } from './utils.service';
import { DataSourceService } from './services/data-source.service';
import { PeriodMappingService } from './services/period-mapping.service';
import { DataSourceSelectionService } from './services/data-source-selection.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SecuritySourceConfig])],
  providers: [
    UtilsService,
    DataSourceService,
    PeriodMappingService,
    DataSourceSelectionService,
  ],
  exports: [
    UtilsService,
    DataSourceService,
    PeriodMappingService,
    DataSourceSelectionService,
  ],
})
export class UtilsModule {}
