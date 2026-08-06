import { RealtimeMarketObservabilityService } from './realtime-market-observability.service';

describe('RealtimeMarketObservabilityService', () => {
  it('aggregates and sorts only bounded source, field, and reason labels', () => {
    const service = new RealtimeMarketObservabilityService();
    service.recordQuantityRejection('tdx', 'volume', 'invalid_type', 1_000);
    service.recordQuantityRejection('tdx', 'volume', 'invalid_type', 2_000);
    service.recordQuantityRejection(
      'qmt',
      'amount',
      'precision_exceeded',
      3_000,
    );

    expect(service.quantityRejectionObservations()).toEqual([
      {
        source: 'qmt',
        field: 'amount',
        reason: 'precision_exceeded',
        total: 1,
        lastFailureAtMs: 3_000,
      },
      {
        source: 'tdx',
        field: 'volume',
        reason: 'invalid_type',
        total: 2,
        lastFailureAtMs: 2_000, // latest occurrence
      },
    ]);
  });

  it('prunes keys whose last failure fell outside the window', () => {
    const service = new RealtimeMarketObservabilityService();
    service.recordQuantityRejection('tdx', 'volume', 'invalid_type', 10_000);
    service.recordQuantityRejection(
      'qmt',
      'amount',
      'precision_exceeded',
      19_000, // inside the window (now - 19s < 5s? no: 20_000 - 19_000 = 1_000 < 5_000)
    );

    service.pruneQuantityRejections(20_000, 5_000);

    expect(service.quantityRejectionObservations()).toEqual([
      {
        source: 'qmt',
        field: 'amount',
        reason: 'precision_exceeded',
        total: 1,
        lastFailureAtMs: 19_000,
      },
    ]);
  });
});
