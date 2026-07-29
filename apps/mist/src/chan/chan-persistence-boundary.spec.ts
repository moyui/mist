import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const chanRoot = join(process.cwd(), 'apps/mist/src/chan');

function runtimeTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry);
    if (statSync(absolutePath).isDirectory()) {
      return runtimeTypeScriptFiles(absolutePath);
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) {
      return [];
    }
    return [absolutePath];
  });
}

describe('Chan persistence boundary', () => {
  it('keeps runtime Chan calculation code free of TypeORM persistence', () => {
    const retiredPersistenceTokens = [
      "from 'typeorm'",
      '@Entity',
      'InjectRepository',
      'Repository<',
      'chan_bis',
      'chan_fenxings',
      'chan_index_periods',
      'chan_states',
    ];

    for (const file of runtimeTypeScriptFiles(chanRoot)) {
      const source = readFileSync(file, 'utf8');
      for (const token of retiredPersistenceTokens) {
        expect(source).not.toContain(token);
      }
    }
  });

  it('defines current Chan calculation shapes as pure interfaces', () => {
    const contractPath = join(chanRoot, 'types', 'chan-analysis.types.ts');
    const source = readFileSync(contractPath, 'utf8');

    expect(relative(chanRoot, contractPath)).toBe(
      'types/chan-analysis.types.ts',
    );
    expect(source).toContain('export interface ChanMergedK');
    expect(source).toContain('export interface ChanFenxing');
    expect(source).toContain('export interface ChanBi');
    expect(source).toContain('export interface ChanBiTwoPhaseResult');
    expect(source).not.toContain('typeorm');
  });
});
