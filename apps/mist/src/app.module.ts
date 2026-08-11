import {
  K,
  KExtensionEf,
  KExtensionTdx,
  KExtensionQmt,
  Security,
  SecuritySourceConfig,
  RealtimeSubscriptionAssignment,
  RuntimeConfig,
  StrategyDefinition,
  StrategyVersion,
  StrategySignal,
  StrategyAlertEvent,
  BacktestRun,
  BacktestSignalResult,
} from '@app/shared-data';
import { DynamicModule, Module, Type } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import { LoggerModule } from 'nestjs-pino';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChanModule } from './chan/chan.module';
import { HistoricalCollectorModule } from './collector/historical-collector.module';
import { TdxRealtimeModule } from './sources/tdx/realtime/realtime.module';
import { QmtRealtimeModule } from './sources/qmt/realtime/realtime.module';
import { IndicatorModule } from './indicator/indicator.module';
import { SecurityModule } from './security/security.module';
import { isMockMode, mistEnvSchema } from '@app/config';
import { StrategyModule } from './strategy/strategy.module';
import { HttpTransportModule } from '@app/transport/http';
import { RealtimeIngressModule } from './realtime/realtime-ingress.module';
import { RealtimeSubscriptionModule } from './realtime-subscriptions/realtime-subscription.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: false, // 不自动打 HTTP 请求日志（避免噪音），保留业务日志
      },
    }),
    HttpTransportModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(
          process.cwd(),
          `.env.${process.env.NODE_ENV || 'development'}`,
        ),
        path.resolve(process.cwd(), '.env'),
      ],
      validationSchema: mistEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // Time window in milliseconds (1 minute)
        limit: 100, // Maximum number of requests within the ttl window
      },
    ]),
    ...mockModeModulesForMode(isMockMode()),
    RealtimeIngressModule,
    ...tdxRealtimeModulesForMode(process.env.TDX_REALTIME_MODE),
    ...qmtRealtimeModulesForMode(process.env.QMT_REALTIME_MODE),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

/** TDX realtime is enabled by default; off is the explicit rollback mode. */
export function tdxRealtimeModulesForMode(mode: string | undefined) {
  const normalized = (mode ?? 'builtin').trim().toLowerCase();
  if (normalized === 'builtin') {
    return [TdxRealtimeModule];
  }
  if (normalized === 'off') {
    return [];
  }
  throw new Error(
    `Unsupported TDX_REALTIME_MODE=${JSON.stringify(mode)}; expected builtin or off`,
  );
}

/** QMT realtime is enabled by default; off is the explicit rollback mode. */
export function qmtRealtimeModulesForMode(mode: string | undefined) {
  const normalized = (mode ?? 'builtin').trim().toLowerCase();
  if (normalized === 'builtin') {
    return [QmtRealtimeModule];
  }
  if (normalized === 'off') {
    return [];
  }
  throw new Error(
    `Unsupported QMT_REALTIME_MODE=${JSON.stringify(mode)}; expected builtin or off`,
  );
}

/**
 * Modules that require MySQL. Mock mode (MIST_MOCK_MODE=true) omits all of
 * them; production keeps them. Single source of truth: adding a business
 * module here automatically excludes it from mock mode.
 *
 * Order-sensitive: the TypeORM forRootAsync dynamic module MUST stay first —
 * Nest initializes dependencies in array order, and the business modules'
 * forFeature repositories resolve against the root DataSource.
 */
export function mockModeModulesForMode(
  isMock: boolean,
): Array<Type<unknown> | DynamicModule> {
  return isMock
    ? []
    : [
        TypeOrmModule.forRootAsync({
          useFactory(configService: ConfigService) {
            return {
              type: 'mysql',
              host: configService.get('mysql_server_host'),
              port: configService.get('mysql_server_port'),
              username: configService.get('mysql_server_username'),
              password: configService.get('mysql_server_password'),
              database: configService.get('mysql_server_database'),
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
                RealtimeSubscriptionAssignment,
                RuntimeConfig,
                StrategyDefinition,
                StrategyVersion,
                StrategySignal,
                StrategyAlertEvent,
                BacktestRun,
                BacktestSignalResult,
              ],
              poolSize: 10,
              connectorPackage: 'mysql2',
              extra: {
                authPlugins: 'sha256_password',
              },
            };
          },
          inject: [ConfigService],
        }),
        HistoricalCollectorModule,
        RealtimeSubscriptionModule,
        IndicatorModule,
        SecurityModule,
        ChanModule,
        StrategyModule,
      ];
}
