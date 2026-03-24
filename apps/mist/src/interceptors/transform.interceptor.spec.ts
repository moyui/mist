import { Test, TestingModule } from '@nestjs/testing';
import { TransformInterceptor } from './transform.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { ApiResponse } from '../interfaces/response.interface';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<any>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransformInterceptor],
    }).compile();

    interceptor = module.get<TransformInterceptor<any>>(TransformInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should wrap data in ApiResponse format', (done) => {
    const context = {} as ExecutionContext;
    const data = { message: 'test data' };
    const next: CallHandler = {
      handle: () => of(data),
    };

    interceptor
      .intercept(context, next)
      .subscribe((result: ApiResponse<any>) => {
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('statusCode', 200);
        expect(result).toHaveProperty('message', 'SUCCESS');
        expect(result).toHaveProperty('data', data);
        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('requestId');
        done();
      });
  });

  it('should generate unique requestId for each request', (done) => {
    jest.setTimeout(10000);
    const context = {} as ExecutionContext;
    const next: CallHandler = {
      handle: () => of({}),
    };

    interceptor
      .intercept(context, next)
      .subscribe((result1: ApiResponse<any>) => {
        interceptor
          .intercept(context, next)
          .subscribe((result2: ApiResponse<any>) => {
            expect(result1.requestId).not.toBe(result2.requestId);
            done();
          });
      });
  });

  it('should generate valid ISO timestamp', (done) => {
    const context = {} as ExecutionContext;
    const next: CallHandler = {
      handle: () => of({}),
    };

    interceptor
      .intercept(context, next)
      .subscribe((result: ApiResponse<any>) => {
        expect(result.timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        );
        done();
      });
  });
});
