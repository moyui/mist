import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RuntimeConfig } from '@app/shared-data';
import { RUNTIME_CONFIG_AUTO_RECONCILE } from './realtime-subscription.constants';

/**
 * Runtime configuration read from the database (declarative-realtime-
 * configuration). The auto-reconcile switch lives in runtime_configs
 * (written via the ops DB channel, see deploy set-realtime-business-
 * allowlist.ps1); the backend caches it in memory and refreshes it every
 * scheduled reconciliation round (<= interval lag, same as convergence).
 *
 * Synchronous consumers (e.g. service.toVo) read the cache; the coordinator's
 * scheduled round drives refresh() so the switch flips without a restart.
 */
@Injectable()
export class RuntimeConfigService {
  constructor(
    @InjectRepository(RuntimeConfig)
    private readonly configs: Repository<RuntimeConfig>,
  ) {}

  private cachedAutoReconcile = false;

  /** Synchronous read for sync code paths (toVo etc.). */
  getAutoReconcileCached(): boolean {
    return this.cachedAutoReconcile;
  }

  /** Async refresh from the DB; keeps the current cache when the row is
   * missing (fail-safe: never flips a running system off by accident). */
  async refresh(): Promise<void> {
    const row = await this.configs.findOne({
      where: { configKey: RUNTIME_CONFIG_AUTO_RECONCILE },
    });
    if (row) {
      this.cachedAutoReconcile = row.configValue === 'true';
    }
  }
}
