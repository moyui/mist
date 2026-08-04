export interface ParsedRedisConnection {
  readonly host: string;
  readonly port: number;
  readonly username?: string;
  readonly password?: string;
  readonly db: number;
  readonly tls?: Record<string, never>;
}

export function parseRedisConnectionUrl(value: string): ParsedRedisConnection {
  if (value.length === 0) throw new Error('Redis URL is required');
  const url = new URL(value);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new TypeError('Redis URL must use redis or rediss');
  }
  const dbText = url.pathname.replace(/^\//, '');
  const db = dbText === '' ? 0 : Number(dbText);
  const port = url.port === '' ? 6379 : Number(url.port);
  if (
    url.hostname.length === 0 ||
    !Number.isSafeInteger(port) ||
    port <= 0 ||
    port > 65_535 ||
    !Number.isSafeInteger(db) ||
    db < 0
  ) {
    throw new TypeError('Redis URL has invalid connection fields');
  }
  return Object.freeze({
    host: url.hostname,
    port,
    ...(url.username === ''
      ? {}
      : { username: decodeURIComponent(url.username) }),
    ...(url.password === ''
      ? {}
      : { password: decodeURIComponent(url.password) }),
    db,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  });
}
