import {
  DataSource,
  Period,
  SecurityStatus,
  SecurityType,
} from '@app/shared-data';
import { QmtCollectionStrategy } from './qmt-collection.strategy';

describe('QmtCollectionStrategy', () => {
  let strategy: QmtCollectionStrategy;
  let mockCollectorService: any;
  let mockSecurityRepository: any;
  let mockTimezoneService: any;

  beforeEach(() => {
    mockCollectorService = {
      collectKForSource: jest.fn().mockResolvedValue(1),
    };
    mockSecurityRepository = {
      find: jest.fn(),
    };
    mockTimezoneService = {
      getCurrentBeijingTime: jest.fn().mockReturnValue(new Date()),
    };

    strategy = new QmtCollectionStrategy(
      mockSecurityRepository as any,
      mockCollectorService,
      mockTimezoneService,
    );
  });

  const createSecurity = (code: string) => ({
    id: 1,
    code,
    name: `Test ${code}`,
    type: SecurityType.STOCK,
    status: SecurityStatus.ACTIVE,
    sourceConfigs: [],
    ks: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('uses QMT as a polling historical bars strategy', () => {
    expect(strategy.source).toBe(DataSource.QMT);
    expect(strategy.mode).toBe('polling');
  });

  it('passes manual collection through CollectorService with DataSource.QMT', async () => {
    const security = createSecurity('600519');
    const startDate = new Date('2026-07-03T09:30:00+08:00');
    const endDate = new Date('2026-07-03T15:00:00+08:00');

    await strategy.collectForSecurity(
      security as any,
      Period.THREE_MIN,
      startDate,
      endDate,
    );

    expect(mockCollectorService.collectKForSource).toHaveBeenCalledWith(
      security.code,
      Period.THREE_MIN,
      startDate,
      endDate,
      DataSource.QMT,
    );
  });

  it('calculates scheduled candle boundaries before collecting from QMT', async () => {
    const security = createSecurity('600519');

    await strategy.collectScheduledCandle(
      security as any,
      Period.THREE_MIN,
      new Date('2026-07-03T09:34:00+08:00'),
    );

    expect(mockCollectorService.collectKForSource).toHaveBeenCalledWith(
      security.code,
      Period.THREE_MIN,
      new Date('2026-07-03T09:30:00+08:00'),
      new Date('2026-07-03T09:33:00+08:00'),
      DataSource.QMT,
    );
  });
});
