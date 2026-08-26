import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, lastValueFrom } from 'rxjs';
import { HttpResponseInterceptor } from './http-response.interceptor';
import { HttpRequestContextService } from './http-request-context.service';
import { BYPASS_RESPONSE_ENVELOPE } from './raw-response.decorator';

describe('HttpResponseInterceptor unit', () => {
  let interceptor: HttpResponseInterceptor<unknown>;
  let reflector: Reflector;
  let contextService: HttpRequestContextService;

  beforeEach(() => {
    reflector = new Reflector();
    contextService = new HttpRequestContextService();
    interceptor = new HttpResponseInterceptor(reflector, contextService);
  });

  function createMockContext(
    path: string,
    isRawDecorated = false,
  ): ExecutionContext {
    const request = { path, url: path };
    const response = {
      statusCode: 200,
      hasHeader: jest.fn().mockReturnValue(false),
      setHeader: jest.fn(),
      status: jest.fn(),
    };

    const handler = () => {};
    const targetClass = class {};

    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) => {
        if (key === BYPASS_RESPONSE_ENVELOPE) {
          return isRawDecorated;
        }
        return undefined;
      });

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      getHandler: () => handler,
      getClass: () => targetClass,
    } as unknown as ExecutionContext;
  }

  it('wraps standard endpoint responses in an API envelope', async () => {
    const context = createMockContext('/v1/securities');
    const next: CallHandler = {
      handle: () => of({ items: ['600519.SH'] }),
    };

    const result = (await lastValueFrom(
      interceptor.intercept(context, next),
    )) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      statusCode: 200,
      message: 'SUCCESS',
      data: { items: ['600519.SH'] },
      path: '/v1/securities',
    });
    expect(result.requestId).toMatch(/^http-[0-9a-f-]{36}$/);
  });

  it('bypasses envelope for GET /health endpoint', async () => {
    const context = createMockContext('/health');
    const healthPayload = {
      status: 'ok',
      service: 'mist-backend',
      instance: 'backend',
    };
    const next: CallHandler = {
      handle: () => of(healthPayload),
    };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe(healthPayload);
    expect(result).not.toHaveProperty('success');
    expect(result).not.toHaveProperty('data');
  });

  it('bypasses envelope when @RawResponse is used', async () => {
    const context = createMockContext('/custom/raw', true);
    const customPayload = { raw: true, count: 10 };
    const next: CallHandler = {
      handle: () => of(customPayload),
    };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe(customPayload);
    expect(result).not.toHaveProperty('success');
  });
});
