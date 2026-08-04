import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

function runtimeStage(dockerfile: string): string {
  const marker = '# Stage 2: Production';
  const index = dockerfile.indexOf(marker);
  if (index < 0) {
    throw new Error(`Missing Dockerfile marker: ${marker}`);
  }
  return dockerfile.slice(index);
}

describe('backend Docker runtime config', () => {
  it('runs the production image as a non-root app user', () => {
    const dockerfile = readRepoFile('Dockerfile');
    const runtime = runtimeStage(dockerfile);

    expect(runtime).toContain('addgroup -S app');
    expect(runtime).toContain('adduser -S app -G app');
    expect(runtime).toContain('--chown=app:app');
    expect(runtime).toContain('USER app');
    expect(runtime.indexOf('USER app')).toBeLessThan(
      runtime.indexOf('ENTRYPOINT'),
    );
  });

  it('uses one builder dependency source with pnpm store caching', () => {
    const dockerfile = readRepoFile('Dockerfile');
    const runtime = runtimeStage(dockerfile);

    expect(dockerfile).toContain(
      '--mount=type=cache,target=/root/.local/share/pnpm/store',
    );
    expect(runtime).toContain(
      'COPY --from=builder --chown=app:app /app/node_modules ./node_modules',
    );
    expect(runtime).not.toContain('npm install -g pnpm');
    expect(runtime).not.toContain('pnpm install --prod');
    expect(runtime).not.toContain('/app/node_modules/.pnpm');
  });

  it('uses a configurable npm registry instead of a hard-coded mirror', () => {
    const dockerfile = readRepoFile('Dockerfile');

    expect(dockerfile).toContain('ARG NPM_REGISTRY=https://registry.npmjs.org');
    expect(dockerfile).toContain('pnpm config set registry ${NPM_REGISTRY}');
    expect(dockerfile).not.toContain('https://registry.npmmirror.com');
  });

  it('keeps Docker build context small while preserving migration inputs', () => {
    const dockerignore = readRepoFile('.dockerignore');

    for (const ignored of [
      'dist/',
      'openspec/',
      '.claude/',
      '.codex/',
      'docs/',
      'tools/**',
      'deploy/**',
    ]) {
      expect(dockerignore).toContain(ignored);
    }

    expect(dockerignore).toContain('!tools/run-migrations.mjs');
    expect(dockerignore).toContain('!deploy/database/');
    expect(dockerignore).toContain('!deploy/database/**');
  });

  it('uses one strict entrypoint and no unused docker-start wrapper', () => {
    const dockerfile = readRepoFile('Dockerfile');
    const entrypoint = readRepoFile('docker-entrypoint.sh');

    expect(entrypoint).toContain('set -euo pipefail');
    expect(entrypoint).toContain('${mysql_server_host:-unset}');
    expect(entrypoint).toContain('${mysql_server_port:-unset}');
    expect(dockerfile).not.toContain('docker-start.sh');
    expect(existsSync(join(process.cwd(), 'docker-start.sh'))).toBe(false);
  });

  it('does not run the retired mcp-server in local compose or Docker builds', () => {
    const compose = readRepoFile('docker-compose.yml');
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(compose).not.toContain('mcp-server');
    expect(compose).not.toContain('dist/apps/mcp-server/main.js');
    expect(compose).not.toContain('8009');
    expect(compose).not.toContain('start:dev:mcp-server');

    expect(packageJson.scripts?.['build:docker']).toBe(
      'nest build mist && nest build backtest && nest build chan && nest build signal && nest build realtime-subscription-hil',
    );
    expect(packageJson.scripts?.['build:docker']).not.toContain('mcp-server');
    expect(packageJson.scripts?.['hil:realtime-subscriptions']).toBe(
      'node dist/apps/realtime-subscription-hil/main.js',
    );
  });
});
