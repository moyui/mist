import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Security, StrategyDefinition } from '@app/shared-data';
import { HealthStateService } from './health/health-state.service';
import { SignalRegistryService } from './signal-registry.service';
import { SignalRuntimeMutex } from './signal-runtime-mutex.service';
import { RuntimeObservabilityService } from './observability/runtime-observability.service';

@Module({
  imports: [TypeOrmModule.forFeature([StrategyDefinition, Security])],
  providers: [
    HealthStateService,
    RuntimeObservabilityService,
    SignalRuntimeMutex,
    SignalRegistryService,
  ],
  exports: [
    HealthStateService,
    RuntimeObservabilityService,
    SignalRuntimeMutex,
    SignalRegistryService,
  ],
})
export class SignalRegistryModule {}
