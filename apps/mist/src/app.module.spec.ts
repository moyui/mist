import {
  mockModeModulesForMode,
  qmtRealtimeModulesForMode,
  tdxRealtimeModulesForMode,
} from './app.module';
import { QmtRealtimeModule } from './sources/qmt/realtime/realtime.module';
import { TdxRealtimeModule } from './sources/tdx/realtime/realtime.module';

describe('TDX realtime mode module matrix', () => {
  it('is builtin by default', () => {
    expect(tdxRealtimeModulesForMode(undefined)).toEqual([TdxRealtimeModule]);
  });

  it('can be explicitly disabled for rollback', () => {
    expect(tdxRealtimeModulesForMode('off')).toEqual([]);
  });

  it('fails closed for an unknown TDX mode', () => {
    expect(() => tdxRealtimeModulesForMode('legacy')).toThrow(
      'Unsupported TDX_REALTIME_MODE',
    );
  });
});

describe('QMT realtime mode module matrix', () => {
  it('is builtin by default', () => {
    expect(qmtRealtimeModulesForMode(undefined)).toEqual([QmtRealtimeModule]);
  });

  it('imports the formal QMT realtime module when enabled', () => {
    expect(qmtRealtimeModulesForMode('builtin')).toEqual([QmtRealtimeModule]);
  });

  it('can be explicitly disabled for rollback', () => {
    expect(qmtRealtimeModulesForMode('off')).toEqual([]);
  });

  it('fails closed for an unknown QMT mode', () => {
    expect(() => qmtRealtimeModulesForMode('legacy')).toThrow(
      'Unsupported QMT_REALTIME_MODE',
    );
  });
});

describe('mock mode module matrix', () => {
  it('omits TypeORM and all business modules in mock mode', () => {
    expect(mockModeModulesForMode(true)).toEqual([]);
  });

  it('keeps TypeORM root + 6 business modules in production mode', () => {
    const modules = mockModeModulesForMode(false);

    expect(modules).toHaveLength(7);
    // First entry is the TypeORM forRootAsync dynamic module (object with
    // a module class); the rest are business module classes (functions).
    expect(typeof modules[0]).toBe('object');
    for (const module of modules.slice(1)) {
      expect(typeof module).toBe('function');
    }
  });
});
