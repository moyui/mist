import type { StrategyBarType } from '../market-data/strategy-bar';
import type { ProjectedStrategyBar } from '../projection/quantity-forward-fill.projector';
import type { StrategyFieldPath } from '../rules/strategy-field.catalog';

export type StrategyUnavailableReason =
  | 'insufficient_history'
  | 'field_unavailable';

export type StrategyEvaluationResult =
  | {
      readonly status: 'unavailable';
      readonly reason: StrategyUnavailableReason;
    }
  | {
      readonly status: 'evaluated';
      readonly matched: boolean;
    };

export interface StrategyFieldObservation {
  readonly current: number | string;
  readonly previous?: number | string;
}

export interface StrategyQuantityEvidenceItem {
  readonly raw: string | null;
  readonly effective: string;
  readonly resolution: 'observed' | 'forwardFilled';
}

export interface StrategyQuantityEvidenceObservation {
  readonly volume?: StrategyQuantityEvidenceItem;
  readonly amount?: StrategyQuantityEvidenceItem;
}

export interface StrategyQuantityEvidence {
  readonly current: StrategyQuantityEvidenceObservation;
  readonly previous?: StrategyQuantityEvidenceObservation;
}

export interface StrategyEvaluationContext {
  readonly anchor: ProjectedStrategyBar;
  readonly barType: StrategyBarType;
  readonly fields: Readonly<
    Partial<Record<StrategyFieldPath, StrategyFieldObservation>>
  >;
  readonly quantityEvidence?: StrategyQuantityEvidence;
}

export type StrategyEvaluationOutcome =
  | {
      readonly status: 'unavailable';
      readonly reason: StrategyUnavailableReason;
    }
  | {
      readonly status: 'evaluated';
      readonly matched: boolean;
      readonly context: StrategyEvaluationContext;
    };
