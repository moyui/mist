import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Runtime key-value configuration (declarative-realtime-configuration).
 *
 * Single source of truth for runtime switches that previously lived in env
 * (e.g. realtime_subscription_auto_reconcile). Written by the ops DB channel
 * (ssh + docker exec, see set-realtime-business-allowlist.ps1) with audit
 * columns (updated_by/comment); read by the backend at startup and refreshed
 * by the coordinator's scheduled reconciliation round.
 */
@Entity({ name: 'runtime_configs' })
export class RuntimeConfig {
  @PrimaryColumn({ name: 'config_key', type: 'varchar', length: 128 })
  configKey!: string;

  @Column({ name: 'config_value', type: 'varchar', length: 512 })
  configValue!: string;

  @Column({
    name: 'updated_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  updatedAt!: Date;

  @Column({ name: 'updated_by', type: 'varchar', length: 64, default: '' })
  updatedBy!: string;

  @Column({ name: 'comment', type: 'varchar', length: 255, default: '' })
  comment!: string;
}
