import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const appRoot = join(process.cwd(), 'apps/mist/src');

describe('Mist naming layout', () => {
  it.each([
    'realtime/candle/candle-bucket.util.ts',
    'realtime/clock.service.ts',
    'realtime/realtime.types.ts',
    'realtime/realtime-native-map.decoder.ts',
    'sources/tdx/tdx-source.service.ts',
    'sources/qmt/qmt-source.service.ts',
    'sources/tdx/tdx-source-fetcher.interface.ts',
    'chan/types/chan-analysis.types.ts',
  ])('keeps the responsibility-aligned path %s', (relativePath) => {
    expect(existsSync(join(appRoot, relativePath))).toBe(true);
  });

  it.each([
    'realtime/candle/candle-bucket.resolver.ts',
    'realtime/clock.ts',
    'realtime/realtime-native-frame.ts',
    'realtime/realtime-native-map-frame.ts',
    'sources/tdx/source.service.ts',
    'sources/qmt/source.service.ts',
    'sources/tdx/tdx-source.interface.ts',
    'chan/entities/chan-bis.entity.ts',
    'chan/entities/chan-fenxings.entity.ts',
    'chan/entities/chan-states.entity.ts',
    'chan/entities/chan-bi.entity.ts',
    'chan/entities/chan-fenxing.entity.ts',
    'chan/entities/chan-index-daily.entity.ts',
    'chan/entities/chan-index-period.entity.ts',
    'chan/entities/chan-state.entity.ts',
    'chan/enums/table.enum.ts',
  ])('does not restore the retired path %s', (relativePath) => {
    expect(existsSync(join(appRoot, relativePath))).toBe(false);
  });

  it('does not restore retired realtime diagnostic names', () => {
    const runtimeFiles = [
      'sources/tdx/realtime/realtime.client.ts',
      'sources/tdx/realtime/realtime.store.ts',
      'sources/qmt/realtime/realtime.client.ts',
      'sources/qmt/realtime/realtime.store.ts',
    ];
    const retired = [
      'tdxRealtimeBridgeReady',
      'collectorReady',
      'datasourceBuildId',
      'setRuntimeError',
      'clearRuntimeError',
    ];

    for (const relativePath of runtimeFiles) {
      const source = readFileSync(join(appRoot, relativePath), 'utf8');
      for (const identifier of retired) {
        expect(source).not.toContain(identifier);
      }
    }
  });

  it('keeps Http wrapper modules importing their controller dependencies', () => {
    const checks: Array<{
      file: string;
      mustContain: string[];
      missingHint: string;
    }> = [
      {
        file: 'indicator/indicator.module.ts',
        mustContain: [
          'IndicatorHttpModule',
          'IndicatorModule',
          'TimezoneModule',
        ],
        missingHint:
          'IndicatorHttpModule must import IndicatorModule + TimezoneModule',
      },
      {
        file: 'chan/chan.module.ts',
        mustContain: [
          'ChanHttpModule',
          'ChanModule',
          'IndicatorModule',
          'TimezoneModule',
        ],
        missingHint:
          'ChanHttpModule must import ChanModule + IndicatorModule + TimezoneModule',
      },
    ];

    for (const { file, mustContain } of checks) {
      const source = readFileSync(join(appRoot, file), 'utf8');
      for (const token of mustContain) {
        expect(source).toContain(token);
      }
      // The Http wrapper's @Module imports line must list all required deps together.
      // Regression 5841f23 only imported the base module and missed Timezone/Indicator.
      const httpModuleMatch = source.match(
        /@Module\(\s*\{\s*imports:\s*\[([^\]]+)\][^\}]*controllers:\s*\[[^\]]+Controller[^\]]*\][^}]*\}\s*\)\s*export class \w*HttpModule/s,
      );
      expect(httpModuleMatch).not.toBeNull();
      const importsBlock = httpModuleMatch?.[1] ?? '';
      for (const token of mustContain.filter(
        (t) => !t.endsWith('HttpModule'),
      )) {
        expect(importsBlock).toContain(token);
      }
    }
  });
});
