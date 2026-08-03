import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, Period } from '@app/shared-data';
import { TimezoneService } from '@app/timezone';
import {
  HttpTransportModule,
  installHttpRequestContext,
} from '@app/transport/http';
import request from 'supertest';
import { SecurityService } from '../security/security.service';
import { CollectorController } from './collector.controller';
import { CollectorService } from './collector.service';
import { CollectionStrategyRegistry } from './strategies/collection-strategy.registry';
import { EastMoneyCollectionStrategy } from './strategies/east-money-collection.strategy';

describe('Collector HTTP error boundary integration', () => {
  let app: INestApplication;
  let errorSpy: jest.SpyInstance;

  beforeAll(async () => {
    const databaseError = new Error('database diagnostic secret');
    const collectorService = new CollectorService(
      {
        findOne: jest.fn().mockRejectedValue(databaseError),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const timezoneService = {
      parseDateString: jest.fn((value: string) => new Date(value)),
      getCurrentBeijingTime: jest.fn(() => new Date()),
    };
    const strategy = new EastMoneyCollectionStrategy(
      {} as never,
      collectorService,
      timezoneService as never,
    );
    const security = { id: 1, code: '600519' };

    const moduleRef = await Test.createTestingModule({
      imports: [HttpTransportModule],
      controllers: [CollectorController],
      providers: [
        {
          provide: SecurityService,
          useValue: {
            findSecurityByCode: jest.fn().mockResolvedValue(security),
            getSecuritySources: jest
              .fn()
              .mockResolvedValue([
                { source: DataSource.EAST_MONEY, enabled: true },
              ]),
          },
        },
        {
          provide: CollectionStrategyRegistry,
          useValue: { resolve: jest.fn().mockReturnValue(strategy) },
        },
        { provide: TimezoneService, useValue: timezoneService },
      ],
    }).compile();

    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    app = moduleRef.createNestApplication();
    installHttpRequestContext(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    errorSpy.mockRestore();
  });

  it('logs one authoritative error across controller, strategy, and service', async () => {
    errorSpy.mockClear();

    const response = await request(app.getHttpServer())
      .post('/v1/collector/collect')
      .send({
        code: '600519',
        period: Period.ONE_MIN,
        source: DataSource.EAST_MONEY,
        startDate: '2026-08-03 09:30:00',
        endDate: '2026-08-03 15:00:00',
      })
      .expect(500);

    expect(response.body).toMatchObject({
      success: false,
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'database diagnostic secret',
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain(response.body.requestId);
    expect(errorSpy.mock.calls[0][1]).toContain('database diagnostic secret');
  });
});
