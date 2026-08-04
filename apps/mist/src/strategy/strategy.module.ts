import { Module } from '@nestjs/common';
import { StrategyAlertEventController } from './controllers/strategy-alert-event.controller';
import { StrategyBacktestController } from './controllers/strategy-backtest.controller';
import { StrategySignalController } from './controllers/strategy-signal.controller';
import { StrategyController } from './controllers/strategy.controller';
import { StrategyCoreModule } from './strategy-core.module';

@Module({
  imports: [StrategyCoreModule],
  controllers: [
    StrategyController,
    StrategySignalController,
    StrategyAlertEventController,
    StrategyBacktestController,
  ],
  exports: [StrategyCoreModule],
})
export class StrategyModule {}
