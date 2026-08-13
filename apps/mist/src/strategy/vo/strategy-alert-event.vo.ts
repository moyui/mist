import { StrategyAlertEvent, StrategyAlertStatus } from '@app/shared-data';

/**
 * Public view of a strategy alert event (mist-backend-code-style-guide §3).
 * Controller responses map the TypeORM entity to this VO so the entity never
 * leaks as the public contract (remediate-alert-delivery-integrity L2).
 */
export class StrategyAlertEventVo {
  id!: number;
  strategySignalId!: number;
  status!: StrategyAlertStatus;
  dedupeKey!: string;
  cooldownUntil?: Date | null;
  deliveryResult?: Record<string, unknown> | null;
  acknowledgedAt?: Date | null;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(entity: StrategyAlertEvent): StrategyAlertEventVo {
    const vo = new StrategyAlertEventVo();
    vo.id = entity.id;
    vo.strategySignalId = entity.strategySignalId;
    vo.status = entity.status;
    vo.dedupeKey = entity.dedupeKey;
    vo.cooldownUntil = entity.cooldownUntil ?? null;
    vo.deliveryResult = entity.deliveryResult ?? null;
    vo.acknowledgedAt = entity.acknowledgedAt ?? null;
    vo.createdAt = entity.createdAt;
    vo.updatedAt = entity.updatedAt;
    return vo;
  }
}
