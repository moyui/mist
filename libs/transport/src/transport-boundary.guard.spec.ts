import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
type OwnedLibrary = {
  alias: string;
  sourceRoot: string;
  publicAliases: ReadonlySet<string>;
};

const ownedLibraries: readonly OwnedLibrary[] = [
  {
    alias: '@app/transport',
    sourceRoot: join(root, 'libs', 'transport', 'src'),
    publicAliases: new Set(['@app/transport/http', '@app/transport/rpc']),
  },
  {
    alias: '@app/backtest',
    sourceRoot: join(root, 'libs', 'backtest', 'src'),
    publicAliases: new Set(['@app/backtest']),
  },
  {
    alias: '@app/signal',
    sourceRoot: join(root, 'libs', 'signal', 'src'),
    publicAliases: new Set(['@app/signal']),
  },
  {
    alias: '@app/strategy',
    sourceRoot: join(root, 'libs', 'strategy', 'src'),
    publicAliases: new Set(['@app/strategy']),
  },
];
const productionFiles = [
  ...typescriptFiles(join(root, 'apps')),
  ...typescriptFiles(join(root, 'libs')),
].filter((file) => !file.endsWith('.spec.ts'));

describe('service boundary import graph', () => {
  it('exposes only exact transport and domain barrel aliases', () => {
    const config = JSON.parse(
      readFileSync(join(root, 'tsconfig.json'), 'utf8'),
    ) as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    const paths = config.compilerOptions.paths;

    expect(paths['@app/transport']).toBeUndefined();
    expect(paths['@app/transport/*']).toBeUndefined();
    expect(paths['@app/transport/http']).toEqual([
      'libs/transport/src/http/index.ts',
    ]);
    expect(paths['@app/transport/rpc']).toEqual([
      'libs/transport/src/rpc/index.ts',
    ]);
    expect(paths['@app/backtest']).toEqual(['libs/backtest/src/index.ts']);
    expect(paths['@app/signal']).toEqual(['libs/signal/src/index.ts']);
    expect(paths['@app/strategy']).toEqual(['libs/strategy/src/index.ts']);
    expect(paths['@app/backtest/*']).toBeUndefined();
    expect(paths['@app/signal/*']).toBeUndefined();
    expect(paths['@app/strategy/*']).toBeUndefined();
  });

  it('keeps transport independent from domain and infrastructure libraries', () => {
    const forbidden = [
      '@app/config',
      '@app/constants',
      '@app/shared-data',
      '@app/strategy',
      '@app/backtest',
      '@app/signal',
      'typeorm',
      'ioredis',
    ];
    const violations = productionFiles
      .filter((file) => file.includes('/libs/transport/src/'))
      .flatMap((file) =>
        importsOf(file)
          .filter((source) =>
            forbidden.some(
              (prefix) => source === prefix || source.startsWith(`${prefix}/`),
            ),
          )
          .map((source) => `${relative(root, file)} -> ${source}`),
      );

    expect(violations).toEqual([]);
  });

  it('forbids external library deep imports and old cross-app HTTP source imports', () => {
    const violations = productionFiles.flatMap((file) => {
      const sources = importsOf(file);
      return sources
        .filter(
          (source) =>
            isExternalOwnedLibraryImport(file, source) ||
            source.includes('apps/mist/src/filters') ||
            source.includes('apps/mist/src/interceptors') ||
            source.includes('mist/src/filters') ||
            source.includes('mist/src/interceptors'),
        )
        .map((source) => `${relative(root, file)} -> ${source}`);
    });

    expect(violations).toEqual([]);
  });

  it('detects alias and relative-path attempts to bypass owned barrels', () => {
    const appFile = join(root, 'apps', 'mist', 'src', 'adapter.ts');
    const transportInternal = join(
      root,
      'libs',
      'transport',
      'src',
      'rpc',
      'rpc-envelope.ts',
    );
    const strategyInternal = join(
      root,
      'libs',
      'strategy',
      'src',
      'internal.ts',
    );
    const transportFile = join(
      root,
      'libs',
      'transport',
      'src',
      'rpc',
      'rpc-decoder.ts',
    );

    expect(
      isExternalOwnedLibraryImport(
        appFile,
        relativeImport(appFile, transportInternal),
      ),
    ).toBe(true);
    expect(
      isExternalOwnedLibraryImport(
        appFile,
        relativeImport(appFile, strategyInternal),
      ),
    ).toBe(true);
    expect(
      isExternalOwnedLibraryImport(appFile, '@app/backtest/internal'),
    ).toBe(true);
    expect(
      isExternalOwnedLibraryImport(appFile, '@app/transport/rpc/internal'),
    ).toBe(true);
    expect(isExternalOwnedLibraryImport(appFile, '@app/backtest')).toBe(false);
    expect(isExternalOwnedLibraryImport(appFile, '@app/transport/rpc')).toBe(
      false,
    );
    expect(isExternalOwnedLibraryImport(transportFile, './rpc-envelope')).toBe(
      false,
    );
  });

  it('extracts static, side-effect, dynamic, and CommonJS module references', () => {
    expect(
      importsFromSource(`
        import '@app/transport/rpc/internal';
        import { value } from '@app/backtest/internal';
        export * from '@app/signal/internal';
        const strategy = import('@app/strategy/internal');
        const transport = require('@app/transport/http/internal');
        import legacy = require('@app/backtest/legacy');
      `),
    ).toEqual([
      '@app/transport/rpc/internal',
      '@app/backtest/internal',
      '@app/signal/internal',
      '@app/strategy/internal',
      '@app/transport/http/internal',
      '@app/backtest/legacy',
    ]);
  });

  it('blocks app-to-app source imports beyond the exact legacy allowlist', () => {
    const legacyAllowlist = new Set([
      'apps/chan/src/chan-app.module.ts -> apps/mist/src/chan/chan.module',
      'apps/realtime-subscription-hil/src/main.ts -> apps/mist/src/realtime/hil/realtime-subscription-hil',
      'apps/schedule/src/data-collection.controller.ts -> apps/mist/src/collector',
      'apps/schedule/src/data-collection.controller.ts -> apps/mist/src/strategy/scanner/strategy-scan.service',
      'apps/schedule/src/schedule.module.ts -> apps/mist/src/collector/historical-collector.module',
      'apps/schedule/src/schedule.module.ts -> apps/mist/src/strategy/strategy-core.module',
    ]);
    const violations = productionFiles
      .filter((file) => file.includes(`${sep}apps${sep}`))
      .flatMap((file) => {
        const owner = relative(join(root, 'apps'), file).split(sep)[0];
        return importsOf(file)
          .filter((source) => source.startsWith('.'))
          .map((source) => ({ source, target: resolve(dirname(file), source) }))
          .filter(({ target }) => target.includes(`${sep}apps${sep}`))
          .filter(({ target }) => {
            const targetOwner = relative(join(root, 'apps'), target).split(
              sep,
            )[0];
            return targetOwner !== owner;
          })
          .map(
            ({ target }) =>
              `${relative(root, file)} -> ${relative(root, target)}`,
          )
          .filter((edge) => !legacyAllowlist.has(edge));
      });

    expect(violations).toEqual([]);
  });

  it('keeps domain contracts pure and the dependency graph acyclic', () => {
    const domainFiles = productionFiles.filter((file) =>
      ['/libs/backtest/', '/libs/signal/', '/libs/strategy/'].some((segment) =>
        file.includes(segment),
      ),
    );
    const forbiddenContractImports = [
      '@nestjs/',
      '@app/transport',
      '@app/shared-data',
      'typeorm',
      'ioredis',
    ];
    const violations = domainFiles.flatMap((file) => {
      const sources = importsOf(file);
      const contractViolations = sources.filter((source) =>
        forbiddenContractImports.some((prefix) => source.startsWith(prefix)),
      );
      const strategyReverseDependency = file.includes('/libs/strategy/')
        ? sources.filter(
            (source) => source === '@app/backtest' || source === '@app/signal',
          )
        : [];
      return [...contractViolations, ...strategyReverseDependency].map(
        (source) => `${relative(root, file)} -> ${source}`,
      );
    });

    expect(violations).toEqual([]);
  });

  it('does not duplicate raw versioned RPC patterns in production callers or handlers', () => {
    const occurrences = new Map<string, string[]>();
    const pattern =
      /['"]([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2}\.v[1-9][0-9]*)['"]/g;

    for (const file of productionFiles) {
      const content = readFileSync(file, 'utf8');
      for (const match of content.matchAll(pattern)) {
        const locations = occurrences.get(match[1]) ?? [];
        locations.push(relative(root, file));
        occurrences.set(match[1], locations);
      }
    }

    expect(
      [...occurrences.entries()].filter(([, files]) => files.length > 1),
    ).toEqual([]);
  });

  it('keeps HTTP global providers out of future hybrid microservices', () => {
    const violations = productionFiles
      .filter((file) =>
        readFileSync(file, 'utf8').includes('connectMicroservice'),
      )
      .filter(
        (file) =>
          !/connectMicroservice[\s\S]{0,800}inheritAppConfig\s*:\s*false/.test(
            readFileSync(file, 'utf8'),
          ),
      )
      .map((file) => relative(root, file));

    expect(violations).toEqual([]);
  });
});

function importsOf(file: string): string[] {
  return importsFromSource(readFileSync(file, 'utf8'), file);
}

function importsFromSource(content: string, file = 'module.ts'): string[] {
  const sourceFile = ts.createSourceFile(
    file,
    content,
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

function isExternalOwnedLibraryImport(file: string, source: string): boolean {
  const aliasOwner = ownedLibraries.find(
    (owner) => source === owner.alias || source.startsWith(`${owner.alias}/`),
  );
  if (aliasOwner) {
    return !aliasOwner.publicAliases.has(source);
  }

  if (!source.startsWith('.')) return false;
  const target = resolve(dirname(file), source);
  const targetOwner = ownedLibraries.find((owner) =>
    isWithinOrEqual(target, owner.sourceRoot),
  );
  if (!targetOwner) return false;
  return !isWithinOrEqual(file, targetOwner.sourceRoot);
}

function isWithinOrEqual(file: string, directory: string): boolean {
  const relativePath = relative(directory, file);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  );
}

function relativeImport(fromFile: string, target: string): string {
  const path = relative(dirname(fromFile), target);
  return path.startsWith('.') ? path : `./${path}`;
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
