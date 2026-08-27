import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repositoryRoot = process.cwd();

describe('Visual-Command pure boundary', () => {
  it('is registered as one exact Nest library alias', () => {
    const nestConfig = JSON.parse(
      readFileSync(join(repositoryRoot, 'nest-cli.json'), 'utf8'),
    ) as { projects: Record<string, unknown> };
    const tsConfig = JSON.parse(
      readFileSync(join(repositoryRoot, 'tsconfig.json'), 'utf8'),
    ) as { compilerOptions: { paths: Record<string, string[]> } };
    const packageJson = JSON.parse(
      readFileSync(join(repositoryRoot, 'package.json'), 'utf8'),
    ) as { jest: { moduleNameMapper: Record<string, string> } };

    expect(nestConfig.projects['visual-command']).toEqual({
      type: 'library',
      root: 'libs/visual-command',
      entryFile: 'index',
      sourceRoot: 'libs/visual-command/src',
      compilerOptions: {
        tsConfigPath: 'libs/visual-command/tsconfig.lib.json',
      },
    });
    expect(tsConfig.compilerOptions.paths['@app/visual-command']).toEqual([
      'libs/visual-command/src/index.ts',
    ]);
    expect(packageJson.jest.moduleNameMapper['^@app/visual-command$']).toBe(
      '<rootDir>/libs/visual-command/src/index.ts',
    );
  });
});
