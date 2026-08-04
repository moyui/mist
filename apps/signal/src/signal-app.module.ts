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
  StrategyVersion,
} from '@app/shared-data';
import * as path from 'node:path';
import { SignalHealthController } from './signal-health.controller';
import { SignalRegistryController } from './signal-registry.controller';
import { SignalRealtimeModule } from './realtime/signal-realtime.module';
import { SignalRegistryModule } from './signal-registry.module';

@Module({
  imports: [
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
          ],
          poolSize: 10,
          connectorPackage: 'mysql2' as const,
          extra: {
            authPlugins: 'sha256_password',
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
  controllers: [SignalHealthController, SignalRegistryController],
})
export class SignalAppModule {}

/** Off mode deliberately omits every Redis and BullMQ provider. */
export function signalRealtimeModulesForMode(mode: RealtimeStrategyMode) {
  if (mode === 'off') return [];
  return [SignalRealtimeModule];
}
