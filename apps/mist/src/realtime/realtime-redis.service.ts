import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * ioredis connection token. Allows tests to inject a fake Redis instance
 * without touching the real constructor.
 */
export const REALTIME_REDIS_CLIENT = Symbol('REALTIME_REDIS_CLIENT');

/**
 * Market-data Redis connection for the current-day realtime candle product.
 *
 * B1 design mandates:
 * - `enableOfflineQueue: false` — a broken connection must NOT buffer and
 *   replay stale commands after recovery (replaying a stale HSET could reopen
 *   a candle that was already sealed).
 * - bounded `maxRetriesPerRequest` — every product Promise must resolve/reject
 *   within the timeout so the per-symbol keyed queue never stalls forever.
 * - explicit connect/command timeouts.
 *
 * This service owns a dedicated market-data ioredis client. The single-node
 * deployment may share the Redis endpoint with BullMQ, but it must use a
 * separate client and the market-only `mist:realtime:v1` key namespace.
 *
 * When `REALTIME_PRODUCTIZATION_MODE=off` (default) the client is never
 * created and {@link isAvailable} returns false — ingress stays memory-only,
 * identical to the pre-B1 behavior.
 */
@Injectable()
export class RealtimeRedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeRedisService.name);
  private readonly url: string;
  private readonly mode: string;
  private ownedClient: Redis | null = null;

  constructor(
    private readonly config: ConfigService,
    @Optional()
    @Inject(REALTIME_REDIS_CLIENT)
    private readonly injectedClient?: Redis,
  ) {
    this.url = this.config.get<string>('MIST_REALTIME_REDIS_URL') ?? '';
    this.mode =
      this.config.get<string>('REALTIME_PRODUCTIZATION_MODE') ?? 'off';
  }

  /**
   * The active ioredis client, or `null` when productization is off / no URL.
   *
   * Consumers MUST check {@link isAvailable} before relying on the return
   * value; a non-null client can still be in a transiently disconnected state
   * because offline queuing is disabled.
   */
  get client(): Redis | null {
    return this.injectedClient ?? this.ownedClient;
  }

  /** True when a real Redis connection is desired and configured. */
  isAvailable(): boolean {
    return this.mode !== 'off' && this.url.length > 0;
  }

  async onModuleInit(): Promise<void> {
    if (!this.isAvailable()) {
      this.logger.log(
        'Realtime Redis disabled (REALTIME_PRODUCTIZATION_MODE=off or no URL); ingress stays memory-only.',
      );
      return;
    }
    if (this.injectedClient) {
      // Test-injected client; do not manage its lifecycle.
      this.logger.log('Using injected realtime Redis client.');
      return;
    }

    this.ownedClient = new Redis(this.url, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      commandTimeout: 3_000,
      // Keep reconnect attempts bounded; never block the event loop forever.
      retryStrategy: (times) =>
        times > 10 ? null : Math.min(times * 500, 5_000),
      // Do not let ioredis lazily hold the connection open without limits.
      lazyConnect: false,
    });

    this.ownedClient.on('error', (err) => {
      // ioredis requires an error listener or the process crashes on emit.
      this.logger.error(`Realtime Redis error: ${err.message}`);
    });
    this.ownedClient.on('reconnecting', (delay: number) => {
      this.logger.warn(`Realtime Redis reconnecting in ${delay}ms`);
    });

    this.logger.log(
      `Realtime Redis connected for productization mode=${this.mode}.`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.ownedClient) {
      this.ownedClient.disconnect();
      this.ownedClient = null;
      this.logger.log('Realtime Redis disconnected.');
    }
  }
}
