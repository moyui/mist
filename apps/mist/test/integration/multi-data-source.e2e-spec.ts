import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DataSource } from 'typeorm';
import { Security } from '../../src/security/security.entity';

describe('Multi-Data Source Integration Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    dataSource = moduleRef.get<DataSource>(DataSource);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Multi-Data Source Endpoints', () => {
    describe('POST /api/stock/init', () => {
      it('should initialize stock successfully', async () => {
        const stockData = {
          code: '000001',
          name: '平安银行',
          type: 'stock',
          periods: [1],
          source: {
            type: 'eastmoney',
          },
        };

        const response = await request(app.getHttpServer())
          .post('/api/stock/init')
          .send(stockData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.code).toBe(200);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.code).toBe('000001');
        expect(response.body.data.name).toBe('平安银行');
      });

      it('should return error for missing required fields', async () => {
        const incompleteData = {
          code: '000001',
          // missing name, type, periods, source
        };

        const response = await request(app.getHttpServer())
          .post('/api/stock/init')
          .send(incompleteData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe(1001); // INVALID_PARAMETER
      });

      it('should return error for invalid source type', async () => {
        const invalidSourceData = {
          code: '000001',
          name: '测试股票',
          type: 'stock',
          periods: [1],
          source: {
            type: 'invalid_source',
          },
        };

        const response = await request(app.getHttpServer())
          .post('/api/stock/init')
          .send(invalidSourceData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe(1001); // INVALID_PARAMETER
      });
    });

    describe('POST /api/stock/add-source', () => {
      beforeAll(async () => {
        // Create a stock for testing
        const securityRepository = dataSource.getRepository(Security);
        const security = securityRepository.create({
          code: '000001',
          name: '平安银行',
          type: 'stock',
          periods: [1],
          source: {
            type: 'eastmoney',
          },
        });
        await securityRepository.save(security);
      });

      it('should add data source successfully', async () => {
        const sourceData = {
          code: '000001',
          source: {
            type: 'tdx',
            config: 'tdx_config',
          },
          periods: [5, 15],
        };

        const response = await request(app.getHttpServer())
          .post('/api/stock/add-source')
          .send(sourceData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.code).toBe(200);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.code).toBe('000001');
        expect(response.body.data.source.type).toBe('tdx');
      });

      it('should return error for missing required fields', async () => {
        const incompleteData = {
          code: '000001',
          // missing source
        };

        const response = await request(app.getHttpServer())
          .post('/api/stock/add-source')
          .send(incompleteData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe(1001); // INVALID_PARAMETER
      });

      it('should return error for non-existent stock', async () => {
        const nonExistentStockCode = '999999';
        const sourceData = {
          code: nonExistentStockCode,
          source: {
            type: 'eastmoney',
          },
          periods: [1],
        };

        const response = await request(app.getHttpServer())
          .post('/api/stock/add-source')
          .send(sourceData)
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe(1002); // STOCK_NOT_FOUND
      });
    });

    describe('POST /api/data-collector/collect', () => {
      let stockCode: string;

      beforeAll(async () => {
        // Create a stock for testing
        const securityRepository = dataSource.getRepository(Security);
        const security = securityRepository.create({
          code: '000001',
          name: '平安银行',
          type: 'stock',
          periods: [1],
          source: {
            type: 'eastmoney',
          },
        });
        const createdSecurity = await securityRepository.save(security);
        stockCode = createdSecurity.code;
      });

      it('should collect data successfully', async () => {
        const collectData = {
          code: stockCode,
          period: 'daily',
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        };

        const response = await request(app.getHttpServer())
          .post('/api/data-collector/collect')
          .send(collectData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.code).toBe(200);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.code).toBe(stockCode);
        expect(response.body.data.period).toBe('daily');
        expect(response.body.data.recordCount).toBeDefined();
      });

      it('should return error for missing required fields', async () => {
        const incompleteData = {
          code: stockCode,
          // missing period, startDate, endDate
        };

        const response = await request(app.getHttpServer())
          .post('/api/data-collector/collect')
          .send(incompleteData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe(1001); // INVALID_PARAMETER
      });

      it('should handle invalid date format', async () => {
        const invalidDateData = {
          code: stockCode,
          period: 'daily',
          startDate: '2024/01/01', // invalid format
          endDate: '2024-01-31',
        };

        const response = await request(app.getHttpServer())
          .post('/api/data-collector/collect')
          .send(invalidDateData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe(1001); // INVALID_PARAMETER
      });

      it('should handle invalid period', async () => {
        const invalidPeriodData = {
          code: stockCode,
          period: 'invalid_period',
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        };

        const response = await request(app.getHttpServer())
          .post('/api/data-collector/collect')
          .send(invalidPeriodData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe(1001); // INVALID_PARAMETER
      });

      it('should collect data for multiple periods', async () => {
        const multiPeriodData = {
          code: stockCode,
          period: '5min',
          startDate: '2024-01-01',
          endDate: '2024-01-02',
        };

        const response = await request(app.getHttpServer())
          .post('/api/data-collector/collect')
          .send(multiPeriodData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.code).toBe(200);
        expect(response.body.data.period).toBe('5min');
      });

      it('should validate date range (start date before end date)', async () => {
        const invalidRangeData = {
          code: stockCode,
          period: 'daily',
          startDate: '2024-01-31',
          endDate: '2024-01-01', // end date before start date
        };

        const response = await request(app.getHttpServer())
          .post('/api/data-collector/collect')
          .send(invalidRangeData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe(1001); // INVALID_PARAMETER
      });
    });

    describe('GET /api/data-collector/status', () => {
      let stockCode: string;

      beforeAll(async () => {
        // Create a stock for testing
        const securityRepository = dataSource.getRepository(Security);
        const security = securityRepository.create({
          code: '000001',
          name: '平安银行',
          type: 'stock',
          periods: [1],
          source: {
            type: 'eastmoney',
          },
        });
        const createdSecurity = await securityRepository.save(security);
        stockCode = createdSecurity.code;
      });

      it('should return collection status', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/data-collector/status/${stockCode}/daily`)
          .query({ startDate: '2024-01-01', endDate: '2024-01-31' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.code).toBe(200);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.code).toBe(stockCode);
        expect(response.body.data.period).toBe('daily');
      });

      it('should return 404 for non-existent stock', async () => {
        const nonExistentCode = '999999';
        const response = await request(app.getHttpServer())
          .get(`/api/data-collector/status/${nonExistentCode}/daily`)
          .query({ startDate: '2024-01-01', endDate: '2024-01-31' })
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe(1002); // STOCK_NOT_FOUND
      });
    });

    describe('Error Handling', () => {
      it('should handle invalid JSON payload', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/stock/init')
          .set('Content-Type', 'application/json')
          .send('invalid json')
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      it('should handle missing content type', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/stock/init')
          .send('test data')
          .expect(415);

        expect(response.body.success).toBe(false);
      });

      it('should handle duplicate stock creation', async () => {
        const stockData = {
          code: '000001',
          name: '平安银行',
          type: 'stock',
          periods: [1],
          source: {
            type: 'eastmoney',
          },
        };

        // First request should succeed
        await request(app.getHttpServer())
          .post('/api/stock/init')
          .send(stockData)
          .expect(201);

        // Second request should fail with 409
        const response = await request(app.getHttpServer())
          .post('/api/stock/init')
          .send(stockData)
          .expect(409);

        expect(response.body.success).toBe(false);
      });
    });

    describe('Performance Testing', () => {
      it('should handle concurrent requests', async () => {
        const securityRepository = dataSource.getRepository(Security);

        const requests = Array.from({ length: 5 }, (_, i) => {
          const securityCode = `CONCURRENT${i + 1}`;
          return securityRepository.create({
            code: securityCode,
            name: `Concurrent Test Stock ${i + 1}`,
            type: 'stock',
            periods: [1],
            source: {
              type: 'eastmoney',
            },
          });
        });

        const createdSecurities = await securityRepository.save(requests);

        const initRequests = createdSecurities.map((security) =>
          request(app.getHttpServer())
            .post('/api/stock/init')
            .send({
              code: security.code,
              name: `Concurrent Test Stock ${security.code.slice(-1)}`,
              type: 'stock',
              periods: [1],
              source: {
                type: 'eastmoney',
              },
            }),
        );

        const responses = await Promise.all(initRequests);
        responses.forEach((response) => {
          expect(response.status).toBe(201);
          expect(response.body.success).toBe(true);
        });
      }, 30000); // 30 second timeout
    });
  });
});
