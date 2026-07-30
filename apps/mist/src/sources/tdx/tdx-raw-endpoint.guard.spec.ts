import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const RAW_TDX_ENDPOINT = '/v1/raw/tdx/call';
const FORBIDDEN_QMT_PRODUCT_DEPENDENCIES = [
  'xtquant',
  'QMT_BRIDGE_GATEWAY_URL',
  'qmt/bridge',
  'builtin_bridge',
  'passorder',
  'query_stock_asset',
  'query_stock_orders',
  'query_stock_positions',
];

function collectProductionTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...collectProductionTsFiles(path));
      continue;
    }
    if (path.endsWith('.ts') && !path.endsWith('.spec.ts')) {
      files.push(path);
    }
  }
  return files;
}

describe('TDX datasource raw endpoint guard', () => {
  it('keeps normal Mist source code off the raw TDX debug endpoint', () => {
    const sourceRoot = join(process.cwd(), 'apps', 'mist', 'src');
    const offenders = collectProductionTsFiles(sourceRoot).filter((file) =>
      readFileSync(file, 'utf8').includes(RAW_TDX_ENDPOINT),
    );

    expect(offenders.map((file) => relative(process.cwd(), file))).toEqual([]);
  });
});

describe('QMT datasource boundary guard', () => {
  it('keeps normal Mist source code off QMT bridge internals and native account APIs', () => {
    const sourceRoot = join(process.cwd(), 'apps', 'mist', 'src');
    const offenders = collectProductionTsFiles(sourceRoot).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return FORBIDDEN_QMT_PRODUCT_DEPENDENCIES.filter((token) =>
        source.includes(token),
      ).map((token) => `${relative(process.cwd(), file)}:${token}`);
    });

    expect(offenders).toEqual([]);
  });
});
