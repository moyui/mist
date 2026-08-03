import 'reflect-metadata';
import type { Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { StrategyAlertEventController } from '../../mist/src/strategy/controllers/strategy-alert-event.controller';
import { StrategyBacktestController } from '../../mist/src/strategy/controllers/strategy-backtest.controller';
import { StrategySignalController } from '../../mist/src/strategy/controllers/strategy-signal.controller';
import { StrategyController } from '../../mist/src/strategy/controllers/strategy.controller';
import { StrategyCoreModule } from '../../mist/src/strategy/strategy-core.module';
import { StrategyModule } from '../../mist/src/strategy/strategy.module';

type ModuleType = Type<unknown>;
type ModuleImport = ModuleType | { module?: ModuleType };

const getMetadataList = <T>(key: string, target: ModuleType): T[] =>
  (Reflect.getMetadata(key, target) as T[] | undefined) ?? [];

const unwrapModule = (moduleImport: ModuleImport): ModuleType | undefined => {
  if (typeof moduleImport === 'function') return moduleImport;
  return moduleImport.module;
};

const loadScheduleModule = async (): Promise<ModuleType> => {
  process.env.mysql_server_host ??= 'localhost';
  process.env.mysql_server_port ??= '3306';
  process.env.mysql_server_username ??= 'root';
  process.env.mysql_server_password ??= 'password';
  process.env.mysql_server_database ??= 'mist_test';

  const module = await import('./schedule.module');
  return module.ScheduleModule;
};

describe('schedule strategy module wiring', () => {
  const strategyControllers = [
    StrategyController,
    StrategySignalController,
    StrategyAlertEventController,
    StrategyBacktestController,
  ];

  it('keeps reusable strategy providers in StrategyCoreModule without public controllers', () => {
    expect(
      getMetadataList<ModuleType>(
        MODULE_METADATA.CONTROLLERS,
        StrategyCoreModule,
      ),
    ).toEqual([]);
  });

  it('keeps public strategy controllers on StrategyModule', () => {
    expect(
      getMetadataList<ModuleType>(MODULE_METADATA.IMPORTS, StrategyModule).map(
        unwrapModule,
      ),
    ).toContain(StrategyCoreModule);
    expect(
      getMetadataList<ModuleType>(MODULE_METADATA.CONTROLLERS, StrategyModule),
    ).toEqual(expect.arrayContaining(strategyControllers));
  });

  it('does not import strategy runtime or mount strategy REST controllers', async () => {
    const ScheduleModule = await loadScheduleModule();

    expect(
      getMetadataList<ModuleImport>(
        MODULE_METADATA.IMPORTS,
        ScheduleModule,
      ).map(unwrapModule),
    ).not.toContain(StrategyCoreModule);
    expect(
      getMetadataList<ModuleType>(MODULE_METADATA.CONTROLLERS, ScheduleModule),
    ).not.toEqual(expect.arrayContaining(strategyControllers));
  });
});
