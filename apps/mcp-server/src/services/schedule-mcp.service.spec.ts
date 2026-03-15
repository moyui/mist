import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleMcpService } from './schedule-mcp.service';
import { SchedulerRegistry } from '@nestjs/schedule';

describe('ScheduleMcpService', () => {
  let service: ScheduleMcpService;
  let schedulerRegistry: SchedulerRegistry;

  const mockCronJob = {
    running: false,
    lastDate: () => new Date('2024-01-01 10:00:00'),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleMcpService,
        {
          provide: SchedulerRegistry,
          useValue: {
            getCronJobs: jest.fn(),
            getCronJob: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ScheduleMcpService>(ScheduleMcpService);
    schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('triggerDataCollection', () => {
    it('should trigger data collection for a symbol and period', async () => {
      const result = (await service.triggerDataCollection(
        '000001',
        'ONE',
      )) as any;
      expect(result.success).toBe(true);
      expect(result.data.symbol).toBe('000001');
      expect(result.data.period).toBe('ONE');
      expect(result.data.status).toBe('queued');
      expect(result.data.jobId).toBeDefined();
    });
  });

  describe('listScheduledJobs', () => {
    it('should list all scheduled jobs', async () => {
      const mockJobMap = new Map([
        ['job1', mockCronJob],
        ['job2', mockCronJob],
      ]);

      jest.spyOn(schedulerRegistry, 'getCronJobs').mockReturnValue(mockJobMap);

      const result = (await service.listScheduledJobs()) as any;
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('job1');
      expect(result.data[0].running).toBe(false);
      expect(result.count).toBe(2);
    });

    it('should return empty list when no jobs', async () => {
      jest.spyOn(schedulerRegistry, 'getCronJobs').mockReturnValue(new Map());

      const result = (await service.listScheduledJobs()) as any;
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe('getJobStatus', () => {
    it('should return job status', async () => {
      jest.spyOn(schedulerRegistry, 'getCronJob').mockReturnValue(mockCronJob);

      const result = (await service.getJobStatus('job1')) as any;
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('job1');
      expect(result.data.running).toBe(false);
      expect(result.data.lastExecution).toBe('2024-01-01T10:00:00.000Z');
    });

    it('should return error when job not found', async () => {
      jest
        .spyOn(schedulerRegistry, 'getCronJob')
        .mockReturnValue(undefined as any);

      const result = (await service.getJobStatus('nonexistent')) as any;
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('not found');
    });
  });

  describe('triggerBatchCollection', () => {
    it('should trigger batch data collection', async () => {
      const symbols = ['000001', '000300'];
      const periods = ['ONE', 'FIVE'] as any;

      const result = (await service.triggerBatchCollection(
        symbols,
        periods,
      )) as any;
      expect(result.success).toBe(true);
      expect(result.data.taskCount).toBe(4); // 2 symbols * 2 periods
      expect(result.data.status).toBe('queued');
      expect(result.data.batchId).toBeDefined();
      expect(result.data.tasks).toHaveLength(3);
    });

    it('should limit returned tasks to 10', async () => {
      const symbols = ['000001', '000002', '000003', '000004', '000005'];
      const periods = ['ONE', 'FIVE', 'FIFTEEN'] as any;

      const result = (await service.triggerBatchCollection(
        symbols,
        periods,
      )) as any;
      expect(result.success).toBe(true);
      expect(result.data.taskCount).toBe(15); // 5 symbols * 3 periods
      expect(result.data.tasks).toHaveLength(10); // Limited to 10
    });
  });

  describe('getScheduleConfig', () => {
    it('should return schedule configuration', async () => {
      const result = (await service.getScheduleConfig()) as any;
      expect(result.success).toBe(true);
      expect(result.data.description).toBe('Mist 数据采集计划配置');
      expect(result.data.schedules).toHaveLength(6);
      expect(result.data.schedules[0].name).toBe('日线数据采集');
      expect(result.data.schedules[0].period).toBe('DAILY');
      expect(result.data.schedules[0].cron).toBe('0 17 * * 1-5');
    });
  });
});
