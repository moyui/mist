import { BacktestRunQueryService } from './backtest-run-query.service';
import { BacktestRunStatus, DataSource, Period } from '@app/shared-data';

describe('BacktestRunQueryService', () => {
  let service: BacktestRunQueryService;
  let runRepo: any;
  let resultRepo: any;

  beforeEach(() => {
    runRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    resultRepo = {
      createQueryBuilder: jest.fn(),
    };
    service = new BacktestRunQueryService(runRepo, resultRepo);
  });

  describe('listRuns', () => {
    it('queries runs with default limit and maps them to Vo', async () => {
      const mockRuns = [
        {
          id: 1,
          strategyDefinitionId: 10,
          strategyVersionId: 10,
          targetUniverse: ['000001'],
          period: Period.FIVE_MIN,

          source: DataSource.TDX,
          startDate: new Date('2026-01-01T00:00:00Z'),
          endDate: new Date('2026-02-01T00:00:00Z'),
          status: BacktestRunStatus.COMPLETED,
          signalCount: 5,
          matchedSecurityCount: 1,
          targetIssues: [],
          startedAt: new Date('2026-02-01T00:00:00Z'),
          completedAt: new Date('2026-02-01T00:01:00Z'),
          errorMessage: null,
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:01:00Z'),
        },
      ];

      const qb: any = {
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockRuns),
      };
      runRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listRuns({
        strategyDefinitionId: 10,
        limit: 20,
      });
      expect(runRepo.createQueryBuilder).toHaveBeenCalledWith('run');
      expect(qb.orderBy).toHaveBeenCalledWith('run.id', 'DESC');
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(qb.where).toHaveBeenCalledWith(
        'run.strategyDefinitionId = :strategyDefinitionId',
        { strategyDefinitionId: 10 },
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(result[0].strategyDefinitionId).toBe(10);
    });

    it('bounds limit between 1 and 100', async () => {
      const qb: any = {
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      runRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listRuns({ limit: 500 });
      expect(qb.take).toHaveBeenCalledWith(100);

      await service.listRuns({ limit: 0 });
      expect(qb.take).toHaveBeenCalledWith(1);
    });
  });
});
