import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const repositoryRoot = process.cwd();
const sourceRoot = join(repositoryRoot, 'libs', 'decimal', 'src');
const runtimeFiles = typescriptFiles(sourceRoot).filter(
  (file) => !file.endsWith('.spec.ts'),
);

const forbiddenPackagePrefixes = [
  '@app',
  '@nestjs',
  'typeorm',
  'mysql2',
  'ioredis',
  'redis',
  'bullmq',
  'axios',
  'undici',
  'http',
  'https',
  'node:http',
  'node:https',
  'dotenv',
] as const;

describe('Decimal8 pure boundary', () => {
  it('is registered as one exact library alias', () => {
    const nestConfig = JSON.parse(
      readFileSync(join(repositoryRoot, 'nest-cli.json'), 'utf8'),
    ) as { projects: Record<string, unknown> };
    const tsConfig = JSON.parse(
      readFileSync(join(repositoryRoot, 'tsconfig.json'), 'utf8'),
    ) as { compilerOptions: { paths: Record<string, string[]> } };
    const packageJson = JSON.parse(
      readFileSync(join(repositoryRoot, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
      jest: { moduleNameMapper: Record<string, string> };
    };

    expect(nestConfig.projects.decimal).toEqual({
      type: 'library',
      root: 'libs/decimal',
      entryFile: 'index',
      sourceRoot: 'libs/decimal/src',
      compilerOptions: {
        tsConfigPath: 'libs/decimal/tsconfig.lib.json',
      },
    });
    expect(tsConfig.compilerOptions.paths['@app/decimal']).toEqual([
      'libs/decimal/src/index.ts',
    ]);
    expect(tsConfig.compilerOptions.paths['@app/decimal/*']).toBeUndefined();
    expect(packageJson.jest.moduleNameMapper['^@app/decimal$']).toBe(
      '<rootDir>/libs/decimal/src/index.ts',
    );
    expect(packageJson.dependencies['big.js']).toBeUndefined();
    expect(packageJson.dependencies['decimal.js']).toBeUndefined();
    expect(packageJson.dependencies['bignumber.js']).toBeUndefined();
  });

  it('does not import framework, infrastructure or sibling code', () => {
    const violations = runtimeFiles.flatMap((file) =>
      importsOf(file)
        .filter(
          (source) =>
            isForbiddenPackage(source) ||
            relativeImportEscapesDecimal(file, source),
        )
        .map((source) => `${relative(repositoryRoot, file)} -> ${source}`),
    );

    expect(violations).toEqual([]);
  });

  it('does not read environment configuration', () => {
    const violations = runtimeFiles
      .filter((file) => /\bprocess\.env\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(repositoryRoot, file));

    expect(violations).toEqual([]);
  });

  it('keeps quantity parsing and comparison on the shared primitive', () => {
    const localUtility = join(
      repositoryRoot,
      'apps',
      'mist',
      'src',
      'sources',
      'k-decimal.util.ts',
    );
    expect(existsSync(localUtility)).toBe(false);

    const consumers = [
      'apps/mist/src/sources/k-save.helper.ts',
      'apps/mist/src/sources/tdx/tdx-source.service.ts',
      'apps/mist/src/sources/qmt/qmt-source.service.ts',
      'libs/shared-data/src/transformers/canonical-decimal.transformer.ts',
      'apps/mist/src/realtime/candle/open-candle-aggregator.ts',
      'apps/mist/src/strategy/rules/strategy-rule-evaluator.ts',
    ];
    for (const consumer of consumers) {
      expect(readFileSync(join(repositoryRoot, consumer), 'utf8')).toContain(
        "from '@app/decimal'",
      );
    }

    const domainConsumers = consumers.slice(4);
    const duplicateArithmetic = domainConsumers.filter((consumer) => {
      const source = readFileSync(join(repositoryRoot, consumer), 'utf8');
      return /\bBigInt\s*\(|DECIMAL_(?:PATTERN|SCALE)/.test(source);
    });
    expect(duplicateArithmetic).toEqual([]);
  });
});

function isForbiddenPackage(source: string): boolean {
  return forbiddenPackagePrefixes.some(
    (prefix) => source === prefix || source.startsWith(`${prefix}/`),
  );
}

function relativeImportEscapesDecimal(
  fromFile: string,
  source: string,
): boolean {
  if (!source.startsWith('.')) return false;
  const target = resolve(dirname(fromFile), source);
  return target !== sourceRoot && !target.startsWith(`${sourceRoot}${sep}`);
}

function importsOf(file: string): string[] {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const imports: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return imports;
}

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? typescriptFiles(path)
      : path.endsWith('.ts')
        ? [path]
        : [];
  });
}
