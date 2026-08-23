import 'reflect-metadata';
import { StrategyDefinition } from '@app/shared-data';

import { BacktestAppModule } from './backtest-app.module';

/**
 * Guards the BacktestAppModule DI surface: every entity injected via
 * `@InjectRepository` into a provider must be registered in the module's
 * TypeOrmModule.forFeature list. Production deployment failure 2026-08-23:
 * BacktestRunExecutor gained a StrategyDefinition repository (chan_bsp
 * dispatch) while the forFeature list was not updated, so the container
 * crashed at startup ("can't resolve dependencies ... StrategyDefinitionRepository
 * at index [4]"). This test pins the contract so the same class of omission
 * fails locally instead of at deploy time.
 */
describe('BacktestAppModule forFeature registration', () => {
  it('registers the StrategyDefinition feature repository for BacktestRunExecutor', () => {
    const imports = Reflect.getMetadata('imports', BacktestAppModule);
    expect(imports).toBeDefined();

    // TypeOrmModule.forFeature(...) dynamic modules expose repository
    // providers keyed by the default Nest repository token (`<Entity>Repository`).
    const repositoryTokens = imports
      .filter(
        (imported: unknown) =>
          imported &&
          typeof imported === 'object' &&
          Array.isArray((imported as { providers?: unknown[] }).providers) &&
          (
            imported as { providers: Array<{ provide?: unknown }> }
          ).providers.some(
            (provider) =>
              provider &&
              typeof provider === 'object' &&
              (provider as { provide?: unknown }).provide === 'KRepository',
          ),
      )
      .flatMap((imported: { providers: Array<{ provide?: unknown }> }) =>
        imported.providers.map((provider) => provider.provide),
      );

    expect(repositoryTokens).toContain('StrategyDefinitionRepository');
    // Sanity: the feature list still registers the other injected repositories.
    expect(repositoryTokens).toEqual(
      expect.arrayContaining([
        'KRepository',
        'SecurityRepository',
        'StrategyVersionRepository',
        'BacktestRunRepository',
        'BacktestSignalResultRepository',
        'StrategyDefinitionRepository',
      ]),
    );
    expect(StrategyDefinition).toBeDefined();
  });
});
