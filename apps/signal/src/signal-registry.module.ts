import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Security, StrategyDefinition } from '@app/shared-data';
import { SignalHealthStateService } from './signal-health-state.service';
import { SignalRegistryService } from './signal-registry.service';

@Module({
  imports: [TypeOrmModule.forFeature([StrategyDefinition, Security])],
  providers: [SignalHealthStateService, SignalRegistryService],
  exports: [SignalHealthStateService, SignalRegistryService],
})
export class SignalRegistryModule {}
