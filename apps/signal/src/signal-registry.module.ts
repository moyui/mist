import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Security, StrategyDefinition } from '@app/shared-data';
import { SignalHealthStateService } from './signal-health-state.service';
import { SignalRegistryService } from './signal-registry.service';
import { SignalRuntimeMutex } from './signal-runtime-mutex.service';
import { SignalRuntimeObservabilityService } from './signal-runtime-observability.service';

@Module({
  imports: [TypeOrmModule.forFeature([StrategyDefinition, Security])],
  providers: [
    SignalHealthStateService,
    SignalRuntimeObservabilityService,
    SignalRuntimeMutex,
    SignalRegistryService,
  ],
  exports: [
    SignalHealthStateService,
    SignalRuntimeObservabilityService,
    SignalRuntimeMutex,
    SignalRegistryService,
  ],
})
export class SignalRegistryModule {}
