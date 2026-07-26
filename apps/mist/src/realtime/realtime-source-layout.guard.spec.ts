import { existsSync } from 'node:fs';
import { join } from 'node:path';

const sourceRoot = join(process.cwd(), 'apps/mist/src/sources');

describe('realtime source layout', () => {
  it.each([
    'source.service.ts',
    'source.service.spec.ts',
    'types.ts',
    'realtime/realtime.module.ts',
    'realtime/realtime.client.ts',
    'realtime/realtime.store.ts',
    'realtime/realtime-allowlist.resolver.ts',
    'realtime/realtime-diagnostic.controller.ts',
    'realtime/native-snapshot.converter.ts',
  ])('keeps the shared provider responsibility at %s', (relativePath) => {
    expect(existsSync(join(sourceRoot, 'tdx', relativePath))).toBe(true);
    expect(existsSync(join(sourceRoot, 'qmt', relativePath))).toBe(true);
  });

  it.each([
    'tdx/tdx-source.service.ts',
    'qmt/qmt-source.service.ts',
    'tdx/realtime/tdx-realtime.client.ts',
    'qmt/realtime/qmt-realtime.client.ts',
    'tdx/realtime/in-memory-realtime.store.ts',
    'qmt/realtime/in-memory-qmt-realtime.store.ts',
  ])('does not restore legacy provider-prefixed path %s', (relativePath) => {
    expect(existsSync(join(sourceRoot, relativePath))).toBe(false);
  });

  it('keeps real provider-only capabilities explicit', () => {
    expect(existsSync(join(sourceRoot, 'tdx/tdx-source.interface.ts'))).toBe(
      true,
    );
    expect(
      existsSync(join(sourceRoot, 'tdx/tdx-raw-endpoint.guard.spec.ts')),
    ).toBe(true);
    expect(existsSync(join(sourceRoot, 'qmt/tdx-source.interface.ts'))).toBe(
      false,
    );
  });
});
