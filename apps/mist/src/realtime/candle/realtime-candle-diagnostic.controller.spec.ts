import { RealtimeCandleDiagnosticController } from './realtime-candle-diagnostic.controller';
import type { RealtimeCandleHealthService } from './realtime-candle-health.service';

describe('RealtimeCandleDiagnosticController', () => {
  it('returns the low-cardinality product health observation', async () => {
    const observation = { status: 'disabled', mode: 'off' };
    const health = {
      observe: jest.fn().mockResolvedValue(observation),
    } as unknown as RealtimeCandleHealthService;
    const controller = new RealtimeCandleDiagnosticController(health);

    await expect(controller.getStatus()).resolves.toBe(observation);
    expect(health.observe).toHaveBeenCalledTimes(1);
  });
});
