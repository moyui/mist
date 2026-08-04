import { parseRedisConnectionUrl } from './redis-connection.config';

describe('parseRedisConnectionUrl', () => {
  it('parses a bounded Redis endpoint', () => {
    expect(
      parseRedisConnectionUrl('redis://worker:secret@redis:6380/2'),
    ).toEqual({
      host: 'redis',
      port: 6380,
      username: 'worker',
      password: 'secret',
      db: 2,
    });
  });

  it.each(['', 'http://redis:6379', 'redis://redis/not-a-db'])(
    'rejects invalid endpoint %s',
    (value) => expect(() => parseRedisConnectionUrl(value)).toThrow(),
  );
});
