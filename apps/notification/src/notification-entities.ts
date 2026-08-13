import {
  K,
  KExtensionEf,
  KExtensionQmt,
  KExtensionTdx,
  Security,
  SecuritySourceConfig,
  StrategyAlertDelivery,
  StrategyAlertEvent,
  StrategyDefinition,
  StrategySignal,
  StrategyVersion,
} from '@app/shared-data';

/**
 * Full entity graph registered by the notification app's TypeORM connection.
 * TypeORM requires the COMPLETE relation graph (e.g. Security -> SecuritySourceConfig
 * and K -> KExtensions), not only the entities the worker directly loads — missing
 * relations throw `Entity metadata for X#y was not found` at buildMetadatas (boot).
 *
 * Kept as a shared constant so notification-entities.spec.ts can validate the graph
 * without booting the app or a database. Add new entities the app touches here.
 */
export const NOTIFICATION_ENTITIES = [
  K,
  KExtensionEf,
  KExtensionTdx,
  KExtensionQmt,
  Security,
  SecuritySourceConfig,
  StrategyDefinition,
  StrategyVersion,
  StrategySignal,
  StrategyAlertEvent,
  StrategyAlertDelivery,
];
