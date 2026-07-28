import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith('.ts')
        ? [path]
        : [];
  });
}

describe('collector orphan guard', () => {
  it('keeps the retired generic scheduler absent from source and Nest metadata', () => {
    const collectorRoot = join(process.cwd(), 'apps/mist/src/collector');
    const retiredSymbol = 'DataCollection' + 'Scheduler';

    expect(
      existsSync(join(collectorRoot, 'data-collection.scheduler.ts')),
    ).toBe(false);
    expect(
      existsSync(join(collectorRoot, 'data-collection.scheduler.spec.ts')),
    ).toBe(false);

    const activeSources = sourceFiles(join(process.cwd(), 'apps'))
      .filter((path) => !path.endsWith('collector-orphan.guard.spec.ts'))
      .map((path) => readFileSync(path, 'utf8'));
    expect(activeSources.some((source) => source.includes(retiredSymbol))).toBe(
      false,
    );
  });
});
