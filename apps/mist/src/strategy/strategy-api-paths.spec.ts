import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { StrategyAlertEventController } from './controllers/strategy-alert-event.controller';
import { StrategyBacktestController } from './controllers/strategy-backtest.controller';
import { StrategySignalController } from './controllers/strategy-signal.controller';
import { StrategyController } from './controllers/strategy.controller';

type RouteMetadata = {
  method: RequestMethod;
  path: string;
};

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [''];
  return Array.isArray(value) ? value : [value];
}

function normalizePath(...segments: string[]): string {
  return `/${segments
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter((segment) => segment.length > 0)
    .join('/')}`;
}

function getRoutes(controller: object): RouteMetadata[] {
  const controllerPrefixes = toArray(
    Reflect.getMetadata(PATH_METADATA, controller) as string | string[],
  );
  const prototype = (controller as { prototype: object }).prototype;

  return Object.getOwnPropertyNames(prototype)
    .filter((property) => property !== 'constructor')
    .flatMap((property) => {
      const handler = prototype[property as keyof typeof prototype];
      const method = Reflect.getMetadata(
        METHOD_METADATA,
        handler,
      ) as RequestMethod;
      const paths = toArray(
        Reflect.getMetadata(PATH_METADATA, handler) as string | string[],
      );

      if (method === undefined) return [];

      return controllerPrefixes.flatMap((prefix) =>
        paths.map((path) => ({
          method,
          path: normalizePath(prefix, path),
        })),
      );
    });
}

function expectRoute(
  routes: RouteMetadata[],
  method: RequestMethod,
  path: string,
): void {
  expect(routes).toContainEqual({ method, path });
}

describe('Strategy API path registry', () => {
  it('registers version-first strategy registry routes', () => {
    const routes = getRoutes(StrategyController);

    expectRoute(routes, RequestMethod.POST, '/v1/strategies');
    expectRoute(routes, RequestMethod.GET, '/v1/strategies');
    expectRoute(routes, RequestMethod.GET, '/v1/strategies/:id');
    expect(routes).not.toContainEqual({
      method: RequestMethod.PATCH,
      path: '/v1/strategies/:id',
    });
    expectRoute(routes, RequestMethod.POST, '/v1/strategies/:id/enable');
    expectRoute(routes, RequestMethod.POST, '/v1/strategies/:id/disable');
    expectRoute(routes, RequestMethod.GET, '/v1/strategies/:id/versions');
  });

  it('registers reserved signal, alert, and backtest routes', () => {
    const routes = [
      ...getRoutes(StrategySignalController),
      ...getRoutes(StrategyAlertEventController),
      ...getRoutes(StrategyBacktestController),
    ];

    expectRoute(routes, RequestMethod.GET, '/v1/strategy-signals');
    expectRoute(routes, RequestMethod.GET, '/v1/strategy-alert-events');
    expectRoute(
      routes,
      RequestMethod.POST,
      '/v1/strategy-alert-events/:id/ack',
    );
    expectRoute(routes, RequestMethod.POST, '/v1/strategy-backtests');
    expectRoute(routes, RequestMethod.GET, '/v1/strategy-backtests');
    expectRoute(routes, RequestMethod.GET, '/v1/strategy-backtests/:runId');
    expectRoute(
      routes,
      RequestMethod.GET,
      '/v1/strategy-backtests/:runId/signals',
    );
  });

  it('keeps gateway and feature-local version prefixes out of controller routes', () => {
    const routes = [
      ...getRoutes(StrategyController),
      ...getRoutes(StrategySignalController),
      ...getRoutes(StrategyAlertEventController),
      ...getRoutes(StrategyBacktestController),
    ];

    expect(routes.map((route) => route.path)).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('/api/mist'),
        expect.stringContaining('/api/chan'),
        expect.stringContaining('/strategy/v1'),
      ]),
    );
  });

  it('does not register a manual live strategy scan route', () => {
    const routes = [
      ...getRoutes(StrategyController),
      ...getRoutes(StrategySignalController),
      ...getRoutes(StrategyAlertEventController),
      ...getRoutes(StrategyBacktestController),
    ];

    expect(routes.map((route) => route.path)).not.toContain(
      '/v1/strategy-scans/run',
    );
  });
});
