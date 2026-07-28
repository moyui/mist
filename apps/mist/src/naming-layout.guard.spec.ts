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
    'chan/entities/chan-bi.entity.ts',
    'chan/entities/chan-fenxing.entity.ts',
    'chan/entities/chan-state.entity.ts',
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
  ])('does not restore the retired path %s', (relativePath) => {
    expect(existsSync(join(appRoot, relativePath))).toBe(false);
  });

  it.each([
    ['chan/entities/chan-bi.entity.ts', "name: 'chan_bis'"],
    ['chan/entities/chan-fenxing.entity.ts', "name: 'chan_fenxings'"],
    ['chan/entities/chan-state.entity.ts', "name: 'chan_states'"],
  ])(
    'preserves the explicit table mapping in %s',
    (relativePath, tableName) => {
      const source = readFileSync(join(appRoot, relativePath), 'utf8');
      expect(source).toContain(tableName);
    },
  );

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
});
