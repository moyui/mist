#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const workspaceRoot = resolve(
  process.env.MIST_WORKSPACE_ROOT ?? join(process.cwd(), '..'),
);

const repos = {
  mist: join(workspaceRoot, 'mist'),
  frontend: join(workspaceRoot, 'mist-fe'),
  datasource: join(workspaceRoot, 'mist-datasource'),
  monitoring: join(workspaceRoot, 'mist-monitoring'),
  skills: join(workspaceRoot, 'mist-skills'),
};

function fail(message) {
  throw new Error(message);
}

function read(path) {
  if (!existsSync(path)) {
    fail(`Missing expected file: ${path}`);
  }
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assertIncludes(content, expected, label) {
  if (!content.includes(expected)) {
    fail(`${label} must include ${JSON.stringify(expected)}`);
  }
}

function assertNotIncludes(content, unexpected, label) {
  if (content.includes(unexpected)) {
    fail(`${label} must not include ${JSON.stringify(unexpected)}`);
  }
}

function assertNode24Nvm(repoPath, label) {
  const nvmrc = read(join(repoPath, '.nvmrc')).trim();
  if (nvmrc !== '24') {
    fail(`${label} .nvmrc must be 24, got ${JSON.stringify(nvmrc)}`);
  }
}

function assertPackageScript(packageJson, scriptName, expectedPart, label) {
  const script = packageJson.scripts?.[scriptName];
  if (!script) {
    fail(`${label} package.json must define scripts.${scriptName}`);
  }
  if (expectedPart && !script.includes(expectedPart)) {
    fail(
      `${label} scripts.${scriptName} must include ${JSON.stringify(expectedPart)}`,
    );
  }
  return script;
}

function assertPackageScriptConfigTargetsExist(packageJson, scriptName, label) {
  const script = packageJson.scripts?.[scriptName];
  if (!script) {
    return;
  }

  const configMatches = [...script.matchAll(/--config\s+([^\s]+)/g)];
  for (const match of configMatches) {
    const configPath = match[1].replace(/^['"]|['"]$/g, '');
    if (!existsSync(join(repos.mist, configPath))) {
      fail(
        `${label} scripts.${scriptName} references missing config ${JSON.stringify(configPath)}`,
      );
    }
  }
}

function assertBackendToolingHygiene(packageJson) {
  const lintStaged = packageJson['lint-staged'] ?? {};
  const lintStagedKeys = Object.keys(lintStaged);
  const coversMjs = lintStagedKeys.some((key) => key.includes('mjs'));
  if (!coversMjs) {
    fail('mist lint-staged must cover .mjs tool scripts');
  }

  const tsconfig = readJson(join(repos.mist, 'tsconfig.json'));
  if (tsconfig.compilerOptions?.forceConsistentCasingInFileNames !== true) {
    fail('mist tsconfig must enable forceConsistentCasingInFileNames');
  }
  if (
    tsconfig.compilerOptions?.noUnusedLocals !== true ||
    tsconfig.compilerOptions?.noUnusedParameters !== true
  ) {
    fail('mist tsconfig must reject unused locals and parameters');
  }

  const paths = tsconfig.compilerOptions?.paths ?? {};
  for (const pathKey of Object.keys(paths)) {
    if (pathKey.startsWith('@app/prompts')) {
      fail('mist tsconfig must not contain stale @app/prompts aliases');
    }
  }

  for (const [pathKey, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets)) {
      continue;
    }
    if (new Set(targets).size !== targets.length) {
      fail(`mist tsconfig path ${pathKey} must not contain duplicate targets`);
    }
  }
}

function assertBackendJestHygiene(packageJson) {
  const jestConfig = packageJson.jest ?? {};
  const collectCoverageFrom = jestConfig.collectCoverageFrom ?? [];
  for (const expected of [
    '!**/*.spec.ts',
    '!**/main.ts',
    '!**/*.config.*',
    '!**/.eslintrc.js',
  ]) {
    if (!collectCoverageFrom.includes(expected)) {
      fail(`mist jest.collectCoverageFrom must include ${expected}`);
    }
  }
}

function assertNoSelectedBackendProductionConsoleCalls() {
  const selectedProductionFiles = [
    'apps/mist/src/collector/collector.service.ts',
    'libs/utils/src/services/data-source.service.ts',
  ];
  const consoleCallPattern = /\bconsole\.(?:log|warn|error|info|debug)\s*\(/g;

  for (const relativePath of selectedProductionFiles) {
    const content = read(join(repos.mist, relativePath));
    const matches = [...content.matchAll(consoleCallPattern)].map(
      (match) => match[0],
    );
    if (matches.length > 0) {
      fail(
        `${relativePath} must use NestJS Logger instead of console.*: ${matches.join(', ')}`,
      );
    }
  }
}

function assertBackendHttpConfigHygiene() {
  const utilsService = read(
    join(repos.mist, 'libs/utils/src/utils.service.ts'),
  );
  if (
    !/import\s+axios,\s*\{\s*AxiosInstance\s*\}\s+from\s+['"]axios['"]/.test(
      utilsService,
    )
  ) {
    fail('UtilsService must import AxiosInstance from axios');
  }
  if (
    !/createAxiosInstance\s*\([^)]*\)\s*:\s*AxiosInstance\s*\{/.test(
      utilsService,
    )
  ) {
    fail('UtilsService.createAxiosInstance must return AxiosInstance');
  }
  if (/createAxiosInstance\s*\([^)]*\)\s*:\s*any\s*\{/.test(utilsService)) {
    fail('UtilsService.createAxiosInstance must not return any');
  }

  const sourcesConstant = read(
    join(repos.mist, 'apps/mist/src/sources/constants.ts'),
  );
  assertIncludes(
    sourcesConstant,
    'DATASOURCE_HTTP_TIMEOUT_MS = 30000',
    'mist datasource HTTP timeout constants',
  );

  for (const relativePath of [
    'apps/mist/src/sources/east-money/east-money-source.service.ts',
    'apps/mist/src/sources/tdx/tdx-source.service.ts',
  ]) {
    const content = read(join(repos.mist, relativePath));
    assertIncludes(
      content,
      'DATASOURCE_HTTP_TIMEOUT_MS',
      `${relativePath} datasource timeout`,
    );
    const literalTimeoutPattern = /timeout:\s*30000\b/;
    if (literalTimeoutPattern.test(content)) {
      fail(`${relativePath} must use DATASOURCE_HTTP_TIMEOUT_MS for timeout`);
    }
  }
}

function assertBackendRuntimeSweep() {
  const envExample = read(join(repos.mist, '.env.example'));
  assertIncludes(
    envExample,
    'TDX_REALTIME_MODE=builtin',
    'mist TDX realtime default mode',
  );

  const collectorService = read(
    join(repos.mist, 'apps/mist/src/collector/collector.service.ts'),
  );
  assertNotIncludes(
    collectorService,
    'ISourceFetcher<any>',
    'mist CollectorService source fetcher typing',
  );
  assertIncludes(
    collectorService,
    'SourceFetcher = EastMoneySource | TdxSource',
    'mist CollectorService source fetcher typing',
  );

  const indicatorService = read(
    join(repos.mist, 'apps/mist/src/indicator/indicator.service.ts'),
  );
  assertNotIncludes(
    indicatorService,
    'String(query.period) as unknown as Period',
    'mist IndicatorService period query',
  );

  const tdxSource = read(
    join(repos.mist, 'apps/mist/src/sources/tdx/tdx-source.service.ts'),
  );
  assertNotIncludes(
    tdxSource,
    'normalizeTdxPeriodFormat',
    'mist TdxSource period mapping',
  );

  for (const retiredPath of [
    'apps/mist/src/sources/tdx/tdx-websocket.service.ts',
    'apps/mist/src/collector/strategies/websocket-collection.strategy.ts',
    'apps/mist/src/sources/tdx/legacy-tdx-realtime.module.ts',
    'apps/mist/src/sources/tdx/legacy-tdx-streaming.controller.ts',
    'apps/mist/src/sources/tdx/kcandle-aggregator.ts',
  ]) {
    if (existsSync(join(repos.mist, retiredPath))) {
      fail(`retired TDX realtime artifact must not exist: ${retiredPath}`);
    }
  }

  const chanService = read(
    join(repos.mist, 'apps/mist/src/chan/chan.service.ts'),
  );
  assertIncludes(chanService, 'analyze(', 'mist ChanService analysis helper');

  const biService = read(
    join(repos.mist, 'apps/mist/src/chan/services/bi.service.ts'),
  );
  if (/(?:startFenxing|endFenxing)!\./.test(biService)) {
    fail('BiService merge paths must use explicit Fenxing invariant guards');
  }
  assertIncludes(
    biService,
    'assertCompleteBi',
    'mist BiService invariant guard',
  );

  const efExtension = read(
    join(repos.mist, 'libs/shared-data/src/entities/k-extension-ef.entity.ts'),
  );
  if (/=\s*0n?;/.test(efExtension)) {
    fail('KExtensionEf nullable fields must default to null, not 0 or 0n');
  }
}

function assertMcpServerDecommissioned(packageJson) {
  const forbiddenPaths = [
    'apps/mcp-server',
    'libs/constants/src/mcp-errors.ts',
    'libs/constants/src/mcp-errors.spec.ts',
  ];
  for (const relativePath of forbiddenPaths) {
    if (existsSync(join(repos.mist, relativePath))) {
      fail(`retired MCP server artifact must not exist: ${relativePath}`);
    }
  }

  if (packageJson.bin?.['mist-mcp']) {
    fail('mist package.json must not expose the retired mist-mcp binary');
  }
  for (const dependencyName of [
    '@modelcontextprotocol/sdk',
    '@rekog/mcp-nest',
    'zod',
  ]) {
    if (packageJson.dependencies?.[dependencyName]) {
      fail(
        `mist package.json must not keep retired MCP dependency ${dependencyName}`,
      );
    }
  }
  for (const [scriptName, command] of Object.entries(
    packageJson.scripts ?? {},
  )) {
    if (scriptName.includes('mcp') || command.includes('mcp-server')) {
      fail(`mist package.json scripts must not reference MCP: ${scriptName}`);
    }
  }
  for (const scriptPath of packageJson.pkg?.scripts ?? []) {
    if (scriptPath.includes('mcp-server')) {
      fail(`mist package pkg.scripts must not reference MCP: ${scriptPath}`);
    }
  }

  const nestCli = read(join(repos.mist, 'nest-cli.json'));
  assertNotIncludes(nestCli, '"mcp-server"', 'mist nest-cli projects');

  const compose = read(join(repos.mist, 'docker-compose.yml'));
  for (const unexpected of [
    'mcp-server',
    'mist-mcp-server',
    'dist/apps/mcp-server/main.js',
    '8009',
  ]) {
    assertNotIncludes(compose, unexpected, 'mist docker-compose retired MCP');
  }

  const dockerfile = read(join(repos.mist, 'Dockerfile'));
  assertNotIncludes(dockerfile, '8009', 'mist Dockerfile retired MCP port');
}

function assertBackendP3QuickWins() {
  const judgeTrendVo = join(
    repos.mist,
    'apps/mist/src/chan/vo/judge-trend.vo.ts',
  );
  if (existsSync(judgeTrendVo)) {
    fail('CODE_SMELL D1.1: JudgeTrendVo active source file must be removed');
  }

  const errorMessages = read(join(repos.mist, 'libs/constants/src/errors.ts'));
  assertNotIncludes(
    errorMessages,
    'BI_INVALID_DIRECTION',
    'CODE_SMELL D1.3 error constants',
  );

  const utilsService = read(
    join(repos.mist, 'libs/utils/src/utils.service.ts'),
  );
  for (const helperName of [
    'getLocalUrl',
    'formatLocalResult',
    'getLatestValidValue',
    'findLastIndex',
    'addZeroToNumber',
    'roundDownToNearestInterval',
  ]) {
    assertNotIncludes(
      utilsService,
      `${helperName}(`,
      `CODE_SMELL D1.2 UtilsService unused helper ${helperName}`,
    );
  }

  const channelService = read(
    join(repos.mist, 'apps/mist/src/chan/services/channel.service.ts'),
  );
  if (/return\s*\{\s*channels\s*,\s*offsetIndex\b/.test(channelService)) {
    fail(
      'CODE_SMELL R1.2: ChannelService.getChannel must not return offsetIndex',
    );
  }

  const dockerWorkflow = read(join(repos.mist, '.github/workflows/docker.yml'));
  assertNotIncludes(
    dockerWorkflow,
    'docker/setup-qemu-action',
    'INFRA_REVIEW I9 backend Docker workflow',
  );
  assertNotIncludes(
    dockerWorkflow,
    'matrix.platform',
    'INFRA_REVIEW I9 backend Docker workflow',
  );

  const releaseWorkflow = read(
    join(repos.mist, '.github/workflows/release.yml'),
  );
  assertNotIncludes(
    releaseWorkflow,
    'docker/setup-qemu-action',
    'INFRA_REVIEW I9 backend release workflow',
  );
}

function assertBackendP3ServiceCleanups() {
  const indicatorService = read(
    join(repos.mist, 'apps/mist/src/indicator/indicator.service.ts'),
  );
  assertNotIncludes(
    indicatorService,
    'interface RunADXDto',
    'CODE_SMELL O1.5 indicator OHLC DTO reuse',
  );
  assertNotIncludes(
    indicatorService,
    'interface RunATRDto',
    'CODE_SMELL O1.5 indicator OHLC DTO reuse',
  );
  assertNotIncludes(
    indicatorService,
    ' as number',
    'CODE_SMELL R1.4 indicator redundant numeric assertions',
  );

  const efExtensionEntity = read(
    join(repos.mist, 'libs/shared-data/src/entities/k-extension-ef.entity.ts'),
  );
  assertNotIncludes(
    efExtensionEntity,
    "comment: '今开价'",
    'CODE_SMELL B1.2 prevOpen column comment',
  );

  const eastMoneyTypes = read(
    join(repos.mist, 'apps/mist/src/sources/east-money/types.ts'),
  );
  assertNotIncludes(
    eastMoneyTypes,
    'export interface EfExtension',
    'CODE_SMELL P1.3 East Money extension type reuse',
  );

  const tdxTypes = read(join(repos.mist, 'apps/mist/src/sources/tdx/types.ts'));
  assertNotIncludes(
    tdxTypes,
    'export interface TdxExtension',
    'CODE_SMELL P1.3 TDX extension type reuse',
  );

  for (const relativePath of ['apps/mist/src/collector/collector.service.ts']) {
    const content = read(join(repos.mist, relativePath));
    assertNotIncludes(
      content,
      'private getFormatCode',
      `CODE_SMELL P1.2 duplicated getFormatCode in ${relativePath}`,
    );
  }

  const biService = read(
    join(repos.mist, 'apps/mist/src/chan/services/bi.service.ts'),
  );
  assertNotIncludes(
    biService,
    'getThreePattern(bi1: BiVo, bi2: BiVo, bi3: BiVo): string | null',
    'CODE_SMELL N1.2 getThreePattern typed return',
  );
  assertNotIncludes(
    biService,
    'lastFrom: string',
    'CODE_SMELL O1.2 getLastBi source tag typing',
  );
  assertNotIncludes(
    biService,
    'private removeBiByIndex<T>',
    'CODE_SMELL N1.4 removeBiByIndex generic',
  );
  assertNotIncludes(
    biService,
    '// 这个不应该存在',
    'CODE_SMELL C1.4 orphan Chan comment',
  );
  assertNotIncludes(
    biService,
    '此参数保留用于兼容性，但不再使用',
    'CODE_SMELL R1.6 stale isBiWideEnough JSDoc',
  );

  const trendService = read(
    join(repos.mist, 'apps/mist/src/chan/services/trend.service.ts'),
  );
  assertNotIncludes(
    trendService,
    'judgeBiTrend',
    'CODE_SMELL N1.5 boolean Bi trend method naming',
  );

  const chanController = read(
    join(repos.mist, 'apps/mist/src/chan/chan.controller.ts'),
  );
  const directDateParseCount = [
    ...chanController.matchAll(
      /this\.timezoneService\.parseDateString\(queryDto\./g,
    ),
  ].length;
  if (directDateParseCount > 2) {
    fail(
      `CODE_SMELL U1.3 ChanController date parsing should be centralized, found ${directDateParseCount} direct calls`,
    );
  }
}

function assertEnvFilesUntracked() {
  const tracked = execFileSync(
    'git',
    ['ls-files', '.env.development', '.env.production'],
    {
      cwd: repos.mist,
      encoding: 'utf8',
    },
  ).trim();

  if (tracked) {
    fail(`mist local env files must not be tracked, still tracked: ${tracked}`);
  }
}

function assertOptionalRepoContracts(repoName, assertContracts) {
  const repoPath = repos[repoName];
  if (!existsSync(repoPath)) {
    console.log(
      `Skipping ${repoName} CI contracts; repo not found at ${repoPath}`,
    );
    return;
  }
  assertContracts();
}

function assertMistBackendContracts() {
  const packageJson = readJson(join(repos.mist, 'package.json'));
  assertNode24Nvm(repos.mist, 'mist');
  if (packageJson.engines?.node !== '>=24.0.0') {
    fail('mist package.json engines.node must be >=24.0.0');
  }

  const lintFix = assertPackageScript(packageJson, 'lint', '--fix', 'mist');
  const lintCheck = assertPackageScript(
    packageJson,
    'lint:check',
    undefined,
    'mist',
  );
  assertNotIncludes(lintCheck, '--fix', 'mist scripts.lint:check');
  assertIncludes(lintFix, 'eslint', 'mist scripts.lint');
  assertPackageScript(packageJson, 'typecheck', 'tsc --noEmit', 'mist');
  assertPackageScript(packageJson, 'test:ci', '--runInBand', 'mist');
  assertPackageScript(
    packageJson,
    'ci:contracts',
    'tools/test-ci-contracts.mjs',
    'mist',
  );
  assertPackageScriptConfigTargetsExist(packageJson, 'test:e2e', 'mist');
  assertBackendToolingHygiene(packageJson);
  assertBackendJestHygiene(packageJson);
  assertNoSelectedBackendProductionConsoleCalls();
  assertBackendHttpConfigHygiene();
  assertMcpServerDecommissioned(packageJson);
  assertBackendRuntimeSweep();
  assertBackendP3QuickWins();
  assertBackendP3ServiceCleanups();

  const gitignore = read(join(repos.mist, '.gitignore'));
  assertIncludes(gitignore, '.env.*', 'mist .gitignore');
  assertIncludes(gitignore, '!.env.example', 'mist .gitignore');
  assertEnvFilesUntracked();

  const dockerWorkflow = read(join(repos.mist, '.github/workflows/docker.yml'));
  assertIncludes(dockerWorkflow, 'validate:', 'mist docker workflow');
  assertIncludes(dockerWorkflow, 'needs: validate', 'mist docker workflow');
  assertIncludes(dockerWorkflow, 'node-version: 24.x', 'mist docker workflow');
  assertIncludes(dockerWorkflow, 'pnpm run lint:check', 'mist docker workflow');
  assertIncludes(dockerWorkflow, 'pnpm run typecheck', 'mist docker workflow');
  assertIncludes(dockerWorkflow, 'pnpm run test:ci', 'mist docker workflow');
  assertIncludes(
    dockerWorkflow,
    'pnpm run ci:contracts',
    'mist docker workflow',
  );

  const releaseWorkflow = read(
    join(repos.mist, '.github/workflows/release.yml'),
  );
  assertIncludes(releaseWorkflow, 'validate:', 'mist release workflow');
  assertIncludes(releaseWorkflow, 'needs: validate', 'mist release workflow');
  assertIncludes(
    releaseWorkflow,
    'environment: production-release',
    'mist release workflow',
  );
  assertIncludes(
    releaseWorkflow,
    'node-version: 24.x',
    'mist release workflow',
  );
  assertIncludes(
    releaseWorkflow,
    'pnpm run lint:check',
    'mist release workflow',
  );
  assertIncludes(
    releaseWorkflow,
    'pnpm run typecheck',
    'mist release workflow',
  );
  assertIncludes(releaseWorkflow, 'pnpm run test:ci', 'mist release workflow');
  assertIncludes(
    releaseWorkflow,
    'pnpm run ci:contracts',
    'mist release workflow',
  );

  const buildWorkflow = read(join(repos.mist, '.github/workflows/build.yml'));
  assertIncludes(buildWorkflow, 'pnpm run lint:check', 'mist build workflow');
  assertIncludes(buildWorkflow, 'pnpm run typecheck', 'mist build workflow');
  assertIncludes(buildWorkflow, 'pnpm run test:ci', 'mist build workflow');
}

function assertFrontendContracts() {
  const packageJson = readJson(join(repos.frontend, 'package.json'));
  assertNode24Nvm(repos.frontend, 'mist-fe');
  if (packageJson.engines?.node !== '>=24.0.0') {
    fail('mist-fe package.json engines.node must be >=24.0.0');
  }
  assertPackageScript(packageJson, 'typecheck', 'tsc --noEmit', 'mist-fe');
  assertPackageScript(packageJson, 'test:ci', '--runInBand', 'mist-fe');

  const workflow = read(join(repos.frontend, '.github/workflows/docker.yml'));
  assertIncludes(workflow, 'validate:', 'mist-fe docker workflow');
  assertIncludes(workflow, 'needs: validate', 'mist-fe docker workflow');
  assertIncludes(workflow, 'node-version: 24.x', 'mist-fe docker workflow');
  assertIncludes(workflow, 'pnpm lint', 'mist-fe docker workflow');
  assertIncludes(workflow, 'pnpm run typecheck', 'mist-fe docker workflow');
  assertIncludes(workflow, 'pnpm run test:ci', 'mist-fe docker workflow');
  assertIncludes(
    workflow,
    'default: node:24-alpine',
    'mist-fe docker workflow',
  );
}

function assertDatasourceContracts() {
  const workflow = read(join(repos.datasource, '.github/workflows/ci.yml'));
  assertIncludes(
    workflow,
    'python-version: "3.12"',
    'mist-datasource CI workflow',
  );
  assertIncludes(
    workflow,
    'uv run ruff check .',
    'mist-datasource CI workflow',
  );
  assertIncludes(
    workflow,
    'uv run pytest -m "not live"',
    'mist-datasource CI workflow',
  );
}

function assertMonitoringContracts() {
  const workflow = read(join(repos.monitoring, '.github/workflows/ci.yml'));
  assertIncludes(
    workflow,
    'go-version-file: go.mod',
    'mist-monitoring CI workflow',
  );
  assertIncludes(workflow, 'gofmt -l .', 'mist-monitoring CI workflow');
  assertIncludes(workflow, 'exit 1', 'mist-monitoring CI workflow');
  assertIncludes(workflow, 'go vet ./...', 'mist-monitoring CI workflow');
  assertIncludes(workflow, 'go test ./...', 'mist-monitoring CI workflow');
  assertIncludes(
    workflow,
    'python -m pytest tests',
    'mist-monitoring CI workflow',
  );
}

function assertSkillsContracts() {
  const workflow = read(join(repos.skills, '.github/workflows/ci.yml'));
  assertIncludes(workflow, 'python-version: "3.12"', 'mist-skills CI workflow');
  assertIncludes(
    workflow,
    'uv sync --frozen --extra dev',
    'mist-skills CI workflow',
  );
  assertIncludes(workflow, 'uv run ruff check .', 'mist-skills CI workflow');
  assertIncludes(workflow, 'uv run pyright', 'mist-skills CI workflow');
  assertIncludes(workflow, 'uv run black --check .', 'mist-skills CI workflow');
  assertIncludes(workflow, 'uv run pytest', 'mist-skills CI workflow');
}

assertMistBackendContracts();
assertOptionalRepoContracts('frontend', assertFrontendContracts);
assertOptionalRepoContracts('datasource', assertDatasourceContracts);
assertOptionalRepoContracts('monitoring', assertMonitoringContracts);
assertOptionalRepoContracts('skills', assertSkillsContracts);

console.log('CI release contract checks passed.');
