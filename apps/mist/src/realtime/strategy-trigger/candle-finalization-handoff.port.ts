import type { CandleFinalizedTriggerV1 } from '@app/signal';

export const CANDLE_FINALIZATION_HANDOFF_PORT = Symbol(
  'CANDLE_FINALIZATION_HANDOFF_PORT',
);

export interface CandleFinalizationHandoffPort {
  publish(trigger: CandleFinalizedTriggerV1): Promise<void>;
}
