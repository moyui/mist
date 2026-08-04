export {
  CANDLE_FINALIZED_JOB_NAME,
  CANDLE_FINALIZED_JOB_OPTIONS,
  STRATEGY_TRIGGER_BULLMQ_PREFIX,
  STRATEGY_TRIGGER_JOB_TIMEOUT_MS,
  STRATEGY_TRIGGER_QUEUE_NAME,
  STRATEGY_TRIGGER_WORKER_CONCURRENCY,
  candleFinalizedJobId,
  decodeCandleFinalizedTriggerV1,
  toStrategyTrigger,
} from './contracts/candle-finalized-trigger.contract';
export type { CandleFinalizedTriggerV1 } from './contracts/candle-finalized-trigger.contract';
