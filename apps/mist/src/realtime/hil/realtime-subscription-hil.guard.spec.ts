import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('test-only realtime subscription HIL harness', () => {
  it('is absent from the production module graph and uses typed clients', () => {
    const appModule = readFileSync(
      resolve(__dirname, '../../app.module.ts'),
      'utf8',
    );
    const harness = readFileSync(
      resolve(__dirname, 'realtime-subscription-hil.ts'),
      'utf8',
    );

    expect(appModule).not.toContain('realtime-subscription-hil');
    expect(harness).toContain('client.subscribe(symbol)');
    expect(harness).toContain('client.unsubscribe(symbol)');
    expect(harness).toContain('client.getSubscriptions()');
    expect(harness).not.toContain('@Controller');
    expect(harness).not.toContain('new WebSocket');
  });
});
