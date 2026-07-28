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
    const entrypoint = readFileSync(
      resolve(__dirname, '../../../../realtime-subscription-hil/src/main.ts'),
      'utf8',
    );

    expect(appModule).not.toContain('realtime-subscription-hil');
    expect(harness).not.toContain('AppModule');
    expect(harness).toContain('createHilModule(source)');
    expect(harness).toContain('client.syncSubscriptions([symbol])');
    expect(harness).toContain('client.syncSubscriptions([])');
    expect(harness).toContain('client.subscribe(overlaySymbol)');
    expect(harness).toContain('client.unsubscribe(overlaySymbol)');
    expect(harness).toContain('client.getSubscriptions()');
    expect(harness).toContain('MIST_HIL_RAW_CAPTURE_DIRECTORY');
    expect(harness).toContain('nativePayload: { [symbol]: snapshot.native }');
    expect(harness).toContain(
      'canonicalReadback: toCanonicalReadbackEvidence(snapshot)',
    );
    expect(harness).not.toContain(
      'canonicalReadback: { native: snapshot.native',
    );
    expect(harness).toContain('validateSubscriptions.exactState');
    expect(harness).toContain('MIST_HIL_EVIDENCE_PATH');
    expect(harness).not.toContain('@Controller');
    expect(harness).not.toContain('new WebSocket');
    expect(entrypoint).toContain('runRealtimeSubscriptionHilFromEnvironment');
    expect(entrypoint).not.toContain('@Controller');
    expect(entrypoint).not.toContain('new WebSocket');
  });
});
