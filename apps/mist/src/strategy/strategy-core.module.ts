import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BacktestRun,
  BacktestSignalResult,
  K,
  StrategyAlertEvent,
  StrategyDefinition,
  StrategySignal,
  StrategyVersion,
} from '@app/shared-data';
import { StrategyEvaluationContextBuilder } from './scanner/strategy-evaluation-context.builder';
import { StrategyScanService } from './scanner/strategy-scan.service';
import { StrategyExecutionPlanService } from './rules/strategy-execution-plan.service';
import { StrategyRuleEvaluator } from './rules/strategy-rule-evaluator';
import { StrategyRuleValidator } from './rules/strategy-rule-validator';
import { StrategyAlertEventService } from './services/strategy-alert-event.service';
import { StrategyBacktestService } from './services/strategy-backtest.service';
import { StrategyDefinitionService } from './services/strategy-definition.service';
import { StrategySignalService } from './services/strategy-signal.service';

const strategyEntities = [
  StrategyDefinition,
  StrategyVersion,
  StrategySignal,
  StrategyAlertEvent,
  BacktestRun,
  BacktestSignalResult,
  K,
];

const strategyProviders = [
  StrategyRuleValidator,
  StrategyExecutionPlanService,
  StrategyRuleEvaluator,
  StrategyEvaluationContextBuilder,
  StrategyDefinitionService,
  StrategySignalService,
  StrategyAlertEventService,
  StrategyBacktestService,
  StrategyScanService,
];

@Module({
  imports: [TypeOrmModule.forFeature(strategyEntities)],
  providers: strategyProviders,
  exports: strategyProviders,
})
export class StrategyCoreModule {}
