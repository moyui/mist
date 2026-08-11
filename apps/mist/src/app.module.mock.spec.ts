import { NestFactory } from '@nestjs/core';

/**
 * AppModule mock-mode bootstrap.
 *
 * This file deliberately does NOT import './app.module' at the top: the
 * @Module decorator evaluates `isMockMode()` at module-import time, so the
 * env must be set before the module is first required. A top-level import
 * would evaluate the decorator with MIST_MOCK_MODE unset and cache the
 * production module set, which cannot be cleanly reset inside the same file
 * (jest.resetModules re-requires, but the top-level binding stays stale and
 * Nest singletons conflict).
 *
 * Separate spec file (matched by testRegex `.*\.spec\.ts$`); env is set
 * before the dynamic require below.
 */

describe('AppModule mock-mode bootstrap', () => {
  const originalMockMode = process.env.MIST_MOCK_MODE;

  afterEach(() => {
    if (originalMockMode === undefined) {
      delete process.env.MIST_MOCK_MODE;
    } else {
      process.env.MIST_MOCK_MODE = originalMockMode;
    }
  });

  it('starts without MySQL when MIST_MOCK_MODE=true', async () => {
    process.env.MIST_MOCK_MODE = 'true';
    // Dynamic require is required: a top-level import would evaluate the
    // @Module decorator with MIST_MOCK_MODE unset (see file doc comment).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('./app.module');

    const app = await NestFactory.create(AppModule, { logger: false });
    try {
      const http = app.getHttpAdapter().getInstance();
      const server = http.listen(0);
      await new Promise<void>((resolve) => {
        server.once('listening', () => resolve());
      });
      const addr = server.address() as { port: number };
      expect(addr.port).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  }, 30_000);
});
