import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RpcTransportModule } from '@app/transport/rpc';
import {
  resolveRealtimeStrategyMode,
  signalEnvSchema,
  type RealtimeStrategyMode,
} from '@app/config';
import {
  K,
  KExtensionEf,
  KExtensionQmt,
  KExtensionTdx,
  Security,
  SecuritySourceConfig,
  StrategyDefinition,
  StrategyAlertEvent,
  StrategySignal,
  StrategyVersion,
} from '@app/shared-data';
import * as path from 'node:path';
import { LoggerModule } from 'nestjs-pino';

import { AppController } from './app.controller';
import { HealthController } from './health/health.controller';
import { SignalRegistryController } from './signal-registry.controller';
import { SignalRealtimeModule } from './realtime/signal-realtime.module';
import { SignalRegistryModule } from './signal-registry.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: false, // 不自动打 HTTP 请求日志（避免噪音），保留业务日志
      },
    }),
    RpcTransportModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(
          process.cwd(),
          `.env.${process.env.NODE_ENV || 'development'}`,
        ),
        path.resolve(process.cwd(), '.env'),
      ],
      validationSchema: signalEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    TypeOrmModule.forRootAsync({
      useFactory(configService: ConfigService) {
        return {
          type: 'mysql' as const,
          host: configService.get<string>('mysql_server_host'),
          port: configService.get<number>('mysql_server_port'),
          username: configService.get<string>('mysql_server_username'),
          password: configService.get<string>('mysql_server_password'),
          database: configService.get<string>('mysql_server_database'),
          timezone: '+08:00',
          synchronize: false,
          logging: configService.get('NODE_ENV') !== 'production',
          entities: [
            K,
            KExtensionEf,
            KExtensionTdx,
            KExtensionQmt,
            Security,
            SecuritySourceConfig,
            StrategyDefinition,
            StrategyVersion,
            StrategySignal,
            StrategyAlertEvent,
          ],
          poolSize: 10,
          connectorPackage: 'mysql2' as const,
          extra: {
            authPlugins: 'sha256_password',
            connectTimeout: 5_000,
          },
        };
      },
      inject: [ConfigService],
    }),
    SignalRegistryModule,
    ...signalRealtimeModulesForMode(
      resolveRealtimeStrategyMode(process.env.REALTIME_STRATEGY_MODE),
    ),
  ],
  controllers: [AppController, HealthController, SignalRegistryController],
})
export class SignalAppModule {}

/** Off mode deliberately omits every Redis and BullMQ provider. */
export function signalRealtimeModulesForMode(mode: RealtimeStrategyMode) {
  if (mode === 'off') return [];
  return [SignalRealtimeModule];
}
