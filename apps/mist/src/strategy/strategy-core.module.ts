import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BacktestRun,
  BacktestSignalResult,
  StrategyAlertEvent,
  StrategyDefinition,
  StrategySignal,
  StrategyVersion,
} from '@app/shared-data';
import { StrategyExecutionPlanService } from './rules/strategy-execution-plan.service';
import { StrategyAlertEventService } from './services/strategy-alert-event.service';
import { BacktestRunCommandService } from './services/backtest-run-command.service';
import { BacktestRunQueryService } from './services/backtest-run-query.service';
import { StrategyDefinitionService } from './services/strategy-definition.service';
import { StrategySignalService } from './services/strategy-signal.service';
import { SignalRegistryRpcModule } from './runtime/signal-registry-rpc.module';
import { BacktestRpcModule } from './runtime/backtest-rpc.module';
import { BacktestStartupCompensationService } from './runtime/backtest-startup-compensation.service';

const strategyEntities = [
  StrategyDefinition,
  StrategyVersion,
  StrategySignal,
  StrategyAlertEvent,
  BacktestRun,
  BacktestSignalResult,
];

const strategyProviders = [
  StrategyExecutionPlanService,
  StrategyDefinitionService,
  StrategySignalService,
  StrategyAlertEventService,
  BacktestRunCommandService,
  BacktestRunQueryService,
  BacktestStartupCompensationService,
];

@Module({
  imports: [
    TypeOrmModule.forFeature(strategyEntities),
    SignalRegistryRpcModule,
    BacktestRpcModule,
  ],
  providers: strategyProviders,
  exports: strategyProviders,
})
export class StrategyCoreModule {}
