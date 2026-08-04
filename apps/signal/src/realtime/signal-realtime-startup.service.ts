import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { BullRegistrar } from '@nestjs/bullmq';
import { SignalRegistryService } from '../signal-registry.service';

@Injectable()
export class SignalRealtimeStartupService implements OnApplicationBootstrap {
  constructor(
    private readonly registry: SignalRegistryService,
    private readonly registrar: BullRegistrar,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.registry.initialize();
    this.registrar.register();
  }
}
