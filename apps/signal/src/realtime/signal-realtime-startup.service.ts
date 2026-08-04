import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { BullRegistrar } from '@nestjs/bullmq';
import { SignalRegistryService } from '../signal-registry.service';
import { CandleFinalizedJobProcessor } from './candle-finalized-job.processor';
import { SignalHealthStateService } from '../signal-health-state.service';

@Injectable()
export class SignalRealtimeStartupService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly registry: SignalRegistryService,
    private readonly registrar: BullRegistrar,
    private readonly processor: CandleFinalizedJobProcessor,
    private readonly healthState: SignalHealthStateService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.registry.initialize();
    this.processor.reconcileRegistry(this.registry.capture());
    this.unsubscribe = this.registry.subscribe((snapshot) =>
      this.processor.reconcileRegistry(snapshot),
    );
    this.registrar.register();
    this.healthState.recordWorkerRunning(true);
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.healthState.recordWorkerRunning(false);
  }
}
