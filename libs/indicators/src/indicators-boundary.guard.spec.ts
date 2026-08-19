import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const repositoryRoot = process.cwd();
const libraryRoot = join(repositoryRoot, 'libs', 'indicators', 'src');
const runtimeFiles = typescriptFiles(libraryRoot).filter(
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

describe('Indicators pure boundary', () => {
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

    expect(nestConfig.projects.indicators).toEqual({
      type: 'library',
      root: 'libs/indicators',
      entryFile: 'index',
      sourceRoot: 'libs/indicators/src',
      compilerOptions: {
        tsConfigPath: 'libs/indicators/tsconfig.lib.json',
      },
    });
    expect(tsConfig.compilerOptions.paths['@app/indicators']).toEqual([
      'libs/indicators/src/index.ts',
    ]);
    expect(tsConfig.compilerOptions.paths['@app/indicators/*']).toBeUndefined();
    expect(packageJson.jest.moduleNameMapper['^@app/indicators$']).toBe(
      '<rootDir>/libs/indicators/src/index.ts',
    );
  });

  it('does not import framework, infrastructure or sibling application code', () => {
    const violations = runtimeFiles.flatMap((file) =>
      importsOf(file)
        .filter(
          (source) =>
            isForbiddenPackage(source) ||
            relativeImportEscapesCore(file, source),
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

  it('confines the technicalindicators dependency to this library', () => {
    const violations = allSourceFiles()
      .filter((file) => !file.startsWith(`${libraryRoot}${sep}`))
      .flatMap((file) =>
        importsOf(file)
          .filter((source) => source === 'technicalindicators')
          .map((source) => `${relative(repositoryRoot, file)} -> ${source}`),
      );

    expect(violations).toEqual([]);
  });
});

function isForbiddenPackage(source: string): boolean {
  return forbiddenPackagePrefixes.some(
    (prefix) => source === prefix || source.startsWith(`${prefix}/`),
  );
}

function relativeImportEscapesCore(fromFile: string, source: string): boolean {
  if (!source.startsWith('.')) {
    return false;
  }

  const target = resolve(dirname(fromFile), source);
  return target !== libraryRoot && !target.startsWith(`${libraryRoot}${sep}`);
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
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      imports.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      imports.push(node.arguments[0].text);
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

/** All TypeScript sources under apps/ and libs/ (excluding specs) for the confinement scan. */
function allSourceFiles(): string[] {
  return ['apps', 'libs'].flatMap((area) => {
    const root = join(repositoryRoot, area);
    return typescriptFiles(root).filter((file) => !file.endsWith('.spec.ts'));
  });
}
