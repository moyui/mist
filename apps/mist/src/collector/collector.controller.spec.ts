import { BadRequestException } from '@nestjs/common';
import { DataSource, Period } from '@app/shared-data';
import { CollectorController } from './collector.controller';

describe('CollectorController collect endpoint (historical only)', () => {
  const createHarness = () => {
    const security = { id: 2, code: '600030' };
    const securityService = {
      findSecurityByCode: jest.fn().mockResolvedValue(security),
      getSecuritySources: jest.fn().mockResolvedValue([
        {
          source: DataSource.TDX,
          enabled: true,
          formatCode: '600030.SH',
        },
      ]),
    };
    const strategy = { collectForSecurity: jest.fn().mockResolvedValue(5) };
    const registry = { resolve: jest.fn().mockReturnValue(strategy) };
    const timezoneService = {
      parseDateString: jest.fn().mockReturnValue(new Date('2026-01-01')),
    };
    const controller = new CollectorController(
      securityService as any,
      registry as any,
      timezoneService as any,
    );

    return { controller, security, securityService, registry, strategy };
  };

  it('collects via the resolved historical strategy', async () => {
    const { controller, strategy } = createHarness();

    await expect(
      controller.collect({
        code: '600030',
        period: Period.ONE_MIN,
        source: DataSource.TDX,
        startDate: '2026-01-01',
        endDate: '2026-01-02',
      }),
    ).resolves.toEqual({
      code: '600030',
      period: Period.ONE_MIN,
      count: 5,
    });

    expect(strategy.collectForSecurity).toHaveBeenCalledWith(
      expect.objectContaining({ code: '600030' }),
      Period.ONE_MIN,
      expect.any(Date),
      expect.any(Date),
    );
  });

  it('rejects collect when no enabled source is configured', async () => {
    const { controller, securityService } = createHarness();
    securityService.getSecuritySources.mockResolvedValue([]);

    await expect(
      controller.collect({
        code: '600030',
        period: Period.ONE_MIN,
        startDate: '2026-01-01',
        endDate: '2026-01-02',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
