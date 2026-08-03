import { RealtimeMarketObservabilityService } from './realtime-market-observability.service';

describe('RealtimeMarketObservabilityService', () => {
  it('aggregates and sorts only bounded source, field, and reason labels', () => {
    const service = new RealtimeMarketObservabilityService();
    service.recordQuantityRejection('tdx', 'volume', 'invalid_type');
    service.recordQuantityRejection('tdx', 'volume', 'invalid_type');
    service.recordQuantityRejection('qmt', 'amount', 'precision_exceeded');

    expect(service.quantityRejectionObservations()).toEqual([
      {
        source: 'qmt',
        field: 'amount',
        reason: 'precision_exceeded',
        total: 1,
      },
      {
        source: 'tdx',
        field: 'volume',
        reason: 'invalid_type',
        total: 2,
      },
    ]);
  });
});
