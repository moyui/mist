import { isPublicHttpCode } from './http-code';

export class HttpBusinessRejection<TCode extends string, TData = never> {
  constructor(
    public readonly code: TCode,
    public readonly message: string,
    public readonly data?: TData,
  ) {
    if (!isPublicHttpCode(code)) {
      throw new Error('Invalid public HTTP business code');
    }
    if (typeof message !== 'string' || message.length === 0) {
      throw new Error('HTTP business rejection message must be non-empty');
    }
  }
}
