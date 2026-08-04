import { redisConnectionOptions } from './signal-realtime.module';

describe('Signal realtime module Redis connection', () => {
  it('parses the shared endpoint without leaking market client ownership', () => {
    expect(
      redisConnectionOptions('redis://worker:secret@redis:6380/2'),
    ).toEqual({
      host: 'redis',
      port: 6380,
      username: 'worker',
      password: 'secret',
      db: 2,
      maxRetriesPerRequest: null,
    });
  });

  it.each(['', 'http://redis:6379', 'redis://redis/not-a-db'])(
    'rejects invalid enabled-mode endpoint %s',
    (value) => {
      expect(() => redisConnectionOptions(value)).toThrow();
    },
  );
});
