import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { HttpExceptionFilter } from './http-exception.filter';
import { HttpRequestContextMiddleware } from './http-request-context.middleware';
import { HttpRequestContextService } from './http-request-context.service';
import { HttpResponseInterceptor } from './http-response.interceptor';
import { createHttpValidationPipe } from './http-validation-error.factory';

@Global()
@Module({
  providers: [
    HttpRequestContextService,
    HttpRequestContextMiddleware,
    { provide: APP_PIPE, useFactory: createHttpValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: HttpResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
  exports: [HttpRequestContextService, HttpRequestContextMiddleware],
})
export class HttpTransportModule {}
