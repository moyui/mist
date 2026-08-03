import { HttpBusinessRejection } from './http-business-rejection';
import {
  defaultHttpCode,
  defaultHttpMessage,
  isPublicHttpCode,
} from './http-code';

describe('public HTTP codes', () => {
  it.each([
    undefined,
    null,
    '',
    123,
    'lowercase',
    'HAS SPACE',
    'HAS-HYPHEN',
    '_PREFIX',
    'A'.repeat(65),
  ])('rejects invalid code %# without compatibility conversion', (code) => {
    expect(isPublicHttpCode(code)).toBe(false);
    expect(() => new HttpBusinessRejection(code as string, 'message')).toThrow(
      'Invalid public HTTP business code',
    );
  });

  it.each(['A', 'NOT_FOUND', 'BACKTEST_QUEUE_FULL', 'CODE_2'])(
    'accepts stable code %s',
    (code) => {
      expect(isPublicHttpCode(code)).toBe(true);
      expect(new HttpBusinessRejection(code, 'message').code).toBe(code);
    },
  );

  it('uses documented transport fallbacks', () => {
    expect(defaultHttpCode(400)).toBe('BAD_REQUEST');
    expect(defaultHttpCode(429)).toBe('TOO_MANY_REQUESTS');
    expect(defaultHttpCode(503)).toBe('SERVICE_UNAVAILABLE');
    expect(defaultHttpCode(418)).toBe('BAD_REQUEST');
    expect(defaultHttpCode(599)).toBe('INTERNAL_ERROR');
    expect(defaultHttpMessage(418)).toBe('Bad Request');
    expect(defaultHttpMessage(599)).toBe('Internal Server Error');
  });
});
