import { SetMetadata } from '@nestjs/common';

export const HTTP_RESPONSE_MESSAGE = Symbol('HTTP_RESPONSE_MESSAGE');

export function HttpResponseMessage(message: string): MethodDecorator {
  return SetMetadata(HTTP_RESPONSE_MESSAGE, message);
}
