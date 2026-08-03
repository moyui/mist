import { ArgumentsHost, INestApplication, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { HttpExceptionFilter } from './http-exception.filter';
import {
  HttpRequestContextMiddleware,
  installHttpRequestContext,
} from './http-request-context.middleware';
import { HttpRequestContextService } from './http-request-context.service';

describe('HTTP request context fallback and installer', () => {
  it('installs middleware only once per application', () => {
    const context = new HttpRequestContextService();
    const middleware = new HttpRequestContextMiddleware(context);
    const use = jest.fn();
    const app = {
      get: jest.fn(() => middleware),
      use,
    } as unknown as INestApplication;

    installHttpRequestContext(app);
    installHttpRequestContext(app);

    expect(app.get).toHaveBeenCalledTimes(1);
    expect(use).toHaveBeenCalledTimes(1);
  });

  it('uses one fallback identity for header, body, and authoritative log', () => {
    const context = new HttpRequestContextService();
    const filter = new HttpExceptionFilter(context);
    const setHeader = jest.fn();
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const response = { setHeader, status, json } as unknown as Response;
    const request = {
      method: 'GET',
      path: '/fallback',
      url: '/fallback?secret=true',
    } as Request;
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as ArgumentsHost;
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    filter.catch(new Error('failure'), host);

    const body = json.mock.calls[0][0] as { requestId: string; path: string };
    expect(body.requestId).toMatch(/^http-[0-9a-f-]{36}$/);
    expect(body.path).toBe('/fallback');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', body.requestId);
    expect(errorSpy.mock.calls[0][0]).toContain(body.requestId);
    errorSpy.mockRestore();
  });
});
