import { Module, Global } from '@nestjs/common';
import { UtilsService } from './utils.service';
import { DataSourceService } from './services/data-source.service';
import { PeriodMappingService } from './services/period-mapping.service';
import { DataSourceSelectionService } from './services/data-source-selection.service';

@Global()
@Module({
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
