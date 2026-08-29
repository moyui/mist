import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import type {
  StrategyBar,
  StrategyMarketDataPort,
  StrategyMarketObservation,
  StrategyRealtimeMarketDataPort,
  StrategyRealtimeWindow,
  StrategyReplayPage,
  StrategyReplayMarketDataPort,
  StrategyReplayWindow,
  StrategyTrigger,
} from './index';

const repositoryRoot = process.cwd();
const sourceRoot = join(repositoryRoot, 'libs', 'strategy', 'src');
const runtimeFiles = typescriptFiles(sourceRoot).filter(
  (file) => !file.endsWith('.spec.ts'),
);

const forbiddenPackagePrefixes = [
  '@nestjs',
  'typeorm',
  'mysql2',
  'ioredis',
  'redis',
  'bullmq',
  '@app/transport',
] as const;

const allowedSiblingImports = new Set([
  '@app/market-data',
  '@app/market-data/*',
]);

describe('Strategy domain boundary', () => {
  it('exposes the complete market-data port without transport or adapter types', () => {
    const port: StrategyMarketDataPort = {
      readReplayPage: async (): Promise<StrategyReplayPage> => ({
        bars: [],
        nextAfterTimestamp: null,
      }),
      loadReplayWindow: async (): Promise<StrategyReplayWindow> => ({
        bars: [],
      }),
      loadRealtimeWindow: async (): Promise<StrategyRealtimeWindow> => ({
        bars: [],
      }),
      resolveRealtimeObservation: async (
        trigger: StrategyTrigger,
      ): Promise<StrategyMarketObservation> => ({
        outcome: 'discarded',
        securityId: trigger.securityId,
        source: trigger.source,
        period: trigger.period,
        timestamp: trigger.timestamp,
      }),
    };

    expect(port).toBeDefined();
  });

  it('lets each runtime implement only its owned capability', () => {
    const replay: StrategyReplayMarketDataPort = {
      readReplayPage: async () => ({
        bars: [],
        nextAfterTimestamp: null,
      }),
      loadReplayWindow: async () => ({
        bars: [],
      }),
    };
    const realtime: StrategyRealtimeMarketDataPort = {
      loadRealtimeWindow: async () => ({ bars: [] }),
      resolveRealtimeObservation: async (trigger) => ({
        outcome: 'discarded',
        securityId: trigger.securityId,
        source: trigger.source,
        period: trigger.period,
        timestamp: trigger.timestamp,
      }),
    };

    expect(replay).toBeDefined();
    expect(realtime).toBeDefined();
  });

  it('keeps canonical quantity and completeness facts in StrategyBar', () => {
    const bar: StrategyBar = {
      securityId: 1,
      source: 'tdx',
      period: 1,
      timestamp: new Date('2026-08-03T01:30:00.000Z'),
      open: 10,
      high: 11,
      low: 9,
      close: 10.5,
      volume: null,
      amount: '0',
      type: 'incomplete',
    };

    expect(bar.volume).toBeNull();
    expect(bar.amount).toBe('0');
    expect(bar.type).toBe('incomplete');
  });

  it('does not import framework, persistence, queue or sibling app source', () => {
    const violations = runtimeFiles.flatMap((file) =>
      importsOf(file)
        .filter(
          (source) =>
            forbiddenPackagePrefixes.some(
              (prefix) => source === prefix || source.startsWith(`${prefix}/`),
            ) ||
            (source.startsWith('@app/') &&
              source !== '@app/decimal' &&
              !allowedSiblingImports.has(source) &&
              // The shared indicator core is a pure library (no I/O) and the evaluator delegates
              // KDJ/MACD math to it (see extract-shared-indicators-library).
              source !== '@app/indicators') ||
            source.startsWith('apps/') ||
            source.includes('/apps/') ||
            relativeImportEscapesStrategy(file, source),
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
});

function relativeImportEscapesStrategy(
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
