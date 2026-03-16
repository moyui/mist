import { Test, TestingModule } from '@nestjs/testing';
import { ChanMcpService } from './chan-mcp.service';
import { ChanService } from '../../../mist/src/chan/chan.service';
import { ChannelService } from '../../../mist/src/chan/services/channel.service';

describe('ChanMcpService', () => {
  let service: ChanMcpService;
  let chanService: ChanService;

  const mockKLines = [
    {
      id: 1,
      symbol: '000001',
      time: '2024-01-01 09:30:00',
      amount: 1000000,
      open: 3000,
      close: 3010,
      highest: 3020,
      lowest: 2990,
    },
    {
      id: 2,
      symbol: '000001',
      time: '2024-01-01 09:31:00',
      amount: 1000000,
      open: 3010,
      close: 3020,
      highest: 3030,
      lowest: 3000,
    },
    {
      id: 3,
      symbol: '000001',
      time: '2024-01-01 09:32:00',
      amount: 1000000,
      open: 3020,
      close: 3015,
      highest: 3025,
      lowest: 3010,
    },
  ];

  const mockBi = [
    {
      id: 1,
      type: 'UP',
      start: { time: new Date('2024-01-01 09:30:00'), price: 3000 },
      end: { time: new Date('2024-01-01 09:32:00'), price: 3025 },
    },
  ] as any[];

  const mockFenxings = [
    {
      id: 1,
      type: 'TOP',
      time: new Date('2024-01-01 09:31:00'),
      price: 3030,
    },
  ] as any[];

  const mockChannels = [
    {
      id: 1,
      high: 3050,
      low: 2980,
      biCount: 4,
    },
  ] as any[];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChanMcpService,
        {
          provide: ChanService,
          useValue: {
            createBi: jest.fn().mockResolvedValue(mockBi) as any,
            getFenxings: jest.fn().mockResolvedValue(mockFenxings) as any,
          },
        },
        {
          provide: ChannelService,
          useValue: {
            createChannel: jest.fn().mockResolvedValue(mockChannels) as any,
          },
        },
      ],
    }).compile();

    service = module.get<ChanMcpService>(ChanMcpService);
    chanService = module.get<ChanService>(ChanService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createBi', () => {
    it('should create bi from klines', async () => {
      (jest.spyOn(chanService, 'createBi') as any).mockResolvedValue(mockBi);

      const result = (await service.createBi(mockKLines)) as any;
      expect(result.success).toBe(true);
      expect(result.data.data).toEqual(mockBi);
      expect(result.data.count).toBe(1);
    });
  });

  describe('getFenxing', () => {
    it('should return fenxings from klines', async () => {
      (jest.spyOn(chanService, 'getFenxings') as any).mockResolvedValue(
        mockFenxings,
      );

      const result = (await service.getFenxing(mockKLines)) as any;
      expect(result.success).toBe(true);
      expect(result.data.data).toEqual(mockFenxings);
      expect(result.data.count).toBe(1);
    });
  });

  describe('analyzeChanTheory', () => {
    it('should perform complete chan theory analysis', async () => {
      const result = (await service.analyzeChanTheory(mockKLines)) as any;
      expect(result.success).toBe(true);
      expect(result.data.bis.data).toEqual(mockBi);
      expect(result.data.bis.count).toBe(1);
      expect(result.data.fenxings.data).toEqual(mockFenxings);
      expect(result.data.fenxings.count).toBe(1);
      expect(result.data.channels.data).toEqual(mockChannels);
      expect(result.data.channels.count).toBe(1);
      expect(result.data.summary.originalKLines).toBe(3);
      expect(result.data.summary.bisCount).toBe(1);
      expect(result.data.summary.fenxingsCount).toBe(1);
      expect(result.data.summary.channelsCount).toBe(1);
    });
  });

  describe('mergeK', () => {
    it('should return not implemented error', async () => {
      const result = (await service.mergeK(mockKLines)) as any;
      expect(result.success).toBe(false);
      expect(result.error).toContain('not directly available');
    });
  });
});
