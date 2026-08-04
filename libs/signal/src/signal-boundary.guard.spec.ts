import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const repositoryRoot = process.cwd();
const contractsRoot = join(
  repositoryRoot,
  'libs',
  'signal',
  'src',
  'contracts',
);
const productionRoots = [
  join(repositoryRoot, 'apps'),
  join(repositoryRoot, 'libs'),
];

describe('Signal contract boundary', () => {
  it('keeps domain contracts free of framework, persistence and transport imports', () => {
    const forbidden = [
      '@nestjs',
      'typeorm',
      'mysql2',
      'ioredis',
      'redis',
      'bullmq',
      '@app/transport',
    ];
    const violations = typescriptFiles(contractsRoot)
      .filter((file) => !file.endsWith('.spec.ts'))
      .flatMap((file) =>
        importsOf(file)
          .filter((source) =>
            forbidden.some(
              (prefix) => source === prefix || source.startsWith(`${prefix}/`),
            ),
          )
          .map((source) => `${relative(repositoryRoot, file)} -> ${source}`),
      );

    expect(violations).toEqual([]);
  });

  it('defines the registry refresh raw pattern only in its owning contract', () => {
    const occurrences = productionRoots
      .flatMap(typescriptFiles)
      .filter((file) => !file.endsWith('.spec.ts'))
      .filter((file) =>
        readFileSync(file, 'utf8').includes('signal.registry.refresh.v1'),
      )
      .map((file) => relative(repositoryRoot, file));

    expect(occurrences).toEqual([
      'libs/signal/src/contracts/signal-registry-refresh.contract.ts',
    ]);
  });

  it('requires callers and handlers to import Signal contracts from the exact root barrel', () => {
    const violations = productionRoots
      .flatMap(typescriptFiles)
      .filter((file) => !file.includes(`${join('libs', 'signal', 'src')}`))
      .flatMap((file) =>
        importsOf(file)
          .filter((source) => source.startsWith('@app/signal/'))
          .map((source) => `${relative(repositoryRoot, file)} -> ${source}`),
      );

    expect(violations).toEqual([]);
  });
});

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
