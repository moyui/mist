import { INestApplication, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { HttpRequestContextService } from './http-request-context.service';

const installedApplications = new WeakSet<INestApplication>();

@Injectable()
export class HttpRequestContextMiddleware implements NestMiddleware {
  constructor(private readonly context: HttpRequestContextService) {}

  use(_request: Request, response: Response, next: NextFunction): void {
    const requestId = this.context.createHttpRequestId();
    response.setHeader('X-Request-Id', requestId);
    this.context.run(requestId, next);
  }
}

export function installHttpRequestContext(app: INestApplication): void {
  if (installedApplications.has(app)) return;

  const middleware = app.get(HttpRequestContextMiddleware, { strict: false });
  app.use(middleware.use.bind(middleware));
  installedApplications.add(app);
}
