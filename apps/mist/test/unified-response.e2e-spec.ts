import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Unified Response Format (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/indicator/k (POST) should return unified success format', async () => {
    const response = await request(app.getHttpServer())
      .post('/indicator/k')
      .send({
        symbol: '000001',
        startDate: '2024-01-01',
        endDate: '2024-01-05',
        daily: true,
      })
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('code', 200);
    expect(response.body).toHaveProperty('message', 'SUCCESS');
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('requestId');
    expect(response.body.data).toBeInstanceOf(Array);
  });

  it('/indicator/k (POST) with invalid params should return unified error format', async () => {
    const response = await request(app.getHttpServer())
      .post('/indicator/k')
      .send({
        symbol: '', // Invalid: empty symbol
        startDate: '2024-01-01',
        endDate: '2024-01-05',
      })
      .expect(400);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('code');
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('requestId');
  });

  it('/chan/merge-k (POST) should return unified format', async () => {
    const response = await request(app.getHttpServer())
      .post('/chan/merge-k')
      .send({
        k: [
          {
            id: 1,
            time: '2024-01-01',
            highest: 3200,
            lowest: 3100,
            open: 3150,
            close: 3180,
            symbol: '000001',
            amount: 1000,
          },
          {
            id: 2,
            time: '2024-01-02',
            highest: 3250,
            lowest: 3150,
            open: 3200,
            close: 3230,
            symbol: '000001',
            amount: 1000,
          },
        ],
      })
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('code', 200);
    expect(response.body).toHaveProperty('data');
  });

  it('should generate unique requestId for each request', async () => {
    const response1 = await request(app.getHttpServer())
      .post('/indicator/k')
      .send({
        symbol: '000001',
        startDate: '2024-01-01',
        endDate: '2024-01-02',
        daily: true,
      })
      .expect(200);

    const response2 = await request(app.getHttpServer())
      .post('/indicator/k')
      .send({
        symbol: '000001',
        startDate: '2024-01-01',
        endDate: '2024-01-02',
        daily: true,
      })
      .expect(200);

    expect(response1.body.requestId).not.toBe(response2.body.requestId);
  });
});
