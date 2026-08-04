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
import { StrategyExecutionPlanService } from './rules/strategy-execution-plan.service';
import { StrategyAlertEventService } from './services/strategy-alert-event.service';
import { StrategyBacktestService } from './services/strategy-backtest.service';
import { StrategyDefinitionService } from './services/strategy-definition.service';
import { StrategySignalService } from './services/strategy-signal.service';
import { SignalRegistryRpcModule } from './runtime/signal-registry-rpc.module';

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
  StrategyExecutionPlanService,
  StrategyDefinitionService,
  StrategySignalService,
  StrategyAlertEventService,
  StrategyBacktestService,
];

@Module({
  imports: [
    TypeOrmModule.forFeature(strategyEntities),
    SignalRegistryRpcModule,
  ],
  providers: strategyProviders,
  exports: strategyProviders,
})
export class StrategyCoreModule {}
