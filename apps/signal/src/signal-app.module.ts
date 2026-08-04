import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RpcTransportModule } from '@app/transport/rpc';
import {
  resolveRealtimeStrategyMode,
  signalEnvSchema,
  type RealtimeStrategyMode,
} from '@app/config';
import { StrategyDefinition, StrategyVersion } from '@app/shared-data';
import * as path from 'node:path';
import { SignalHealthController } from './signal-health.controller';
import { SignalHealthStateService } from './signal-health-state.service';
import { SignalRegistryController } from './signal-registry.controller';
import { SignalRegistryService } from './signal-registry.service';

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
          entities: [StrategyDefinition, StrategyVersion],
          poolSize: 10,
          connectorPackage: 'mysql2' as const,
          extra: {
            authPlugins: 'sha256_password',
          },
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([StrategyDefinition, StrategyVersion]),
    ...signalRealtimeModulesForMode(
      resolveRealtimeStrategyMode(process.env.REALTIME_STRATEGY_MODE),
    ),
  ],
  controllers: [SignalHealthController, SignalRegistryController],
  providers: [SignalHealthStateService, SignalRegistryService],
})
export class SignalAppModule {}

/** Prevent enabled modes from starting before their Redis/Worker graph exists. */
export function signalRealtimeModulesForMode(mode: RealtimeStrategyMode) {
  if (mode === 'off') return [];
  throw new Error(
    `REALTIME_STRATEGY_MODE=${mode} is unavailable until the Signal realtime module is assembled`,
  );
}
