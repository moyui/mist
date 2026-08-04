import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const SIGNAL_MARKET_REDIS_CLIENT = Symbol('SIGNAL_MARKET_REDIS_CLIENT');

@Injectable()
export class SignalRealtimeRedisService
  implements OnModuleInit, OnModuleDestroy
{
  private ownedClient: Redis | null = null;

  constructor(
    private readonly config: ConfigService,
    @Optional()
    @Inject(SIGNAL_MARKET_REDIS_CLIENT)
    private readonly injectedClient?: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.injectedClient) return;
    const url = this.config.get<string>('MIST_REALTIME_REDIS_URL') ?? '';
    if (url.length === 0) {
      throw new Error(
        'MIST_REALTIME_REDIS_URL is required when realtime strategy is enabled',
      );
    }
    const client = new Redis(url, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      commandTimeout: 3_000,
      retryStrategy: (times) =>
        times > 10 ? null : Math.min(times * 500, 5_000),
      lazyConnect: true,
    });
    client.on('error', () => undefined);
    await client.connect();
    this.ownedClient = client;
  }

  get client(): Redis {
    const client = this.injectedClient ?? this.ownedClient;
    if (!client) throw new Error('Signal market Redis is not connected');
    return client;
  }

  onModuleDestroy(): void {
    this.ownedClient?.disconnect();
    this.ownedClient = null;
  }
}
