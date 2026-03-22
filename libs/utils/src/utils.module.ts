import { Module, Global } from '@nestjs/common';
import { UtilsService } from './utils.service';
import { DataSourceService } from './services/data-source.service';
import { PeriodMappingService } from './services/period-mapping.service';

@Global()
@Module({
  providers: [UtilsService, DataSourceService, PeriodMappingService],
  exports: [UtilsService, DataSourceService, PeriodMappingService],
})
export class UtilsModule {}
