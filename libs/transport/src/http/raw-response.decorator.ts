import { SetMetadata } from '@nestjs/common';

export const BYPASS_RESPONSE_ENVELOPE = Symbol('BYPASS_RESPONSE_ENVELOPE');

/**
 * Decorator to bypass HttpTransportModule's response envelope wrapping
 * and return the raw handler return value directly.
 */
export const RawResponse = (): MethodDecorator & ClassDecorator =>
  SetMetadata(BYPASS_RESPONSE_ENVELOPE, true);
