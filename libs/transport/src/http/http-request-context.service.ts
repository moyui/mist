import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

interface HttpRequestContextStore {
  requestId: string;
}

@Injectable()
export class HttpRequestContextService {
  private readonly storage = new AsyncLocalStorage<HttpRequestContextStore>();

  run<T>(requestId: string, callback: () => T): T {
    return this.storage.run({ requestId }, callback);
  }

  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  createHttpRequestId(): string {
    return `http-${randomUUID()}`;
  }
}
