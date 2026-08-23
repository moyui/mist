import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { backtestEnvSchema } from '@app/config';
import {
  BacktestRun,
  BacktestSignalResult,
  K,
  KExtensionEf,
  KExtensionQmt,
  KExtensionTdx,
  Security,
  SecuritySourceConfig,
  StrategyAlertEvent,
  StrategyDefinition,
  StrategySignal,
  StrategyVersion,
} from '@app/shared-data';
import { RpcTransportModule } from '@app/transport/rpc';
import { LoggerModule } from 'nestjs-pino';

import { BacktestCommandController } from './backtest-command.controller';
import { BacktestHealthController } from './backtest-health.controller';
import { BacktestHealthStateService } from './backtest-health-state.service';
import { BacktestMarketDataAdapter } from './backtest-market-data.adapter';
import { BacktestAdmissionService } from './backtest-admission.service';
import { BacktestRunExecutor } from './backtest-run.executor';
import { BacktestStartupService } from './backtest-startup.service';

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
      validationSchema: backtestEnvSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory(config: ConfigService) {
        return {
          type: 'mysql' as const,
          host: config.get<string>('mysql_server_host'),
          port: config.get<number>('mysql_server_port'),
          username: config.get<string>('mysql_server_username'),
          password: config.get<string>('mysql_server_password'),
          database: config.get<string>('mysql_server_database'),
          timezone: '+08:00',
          synchronize: false,
          logging: config.get<string>('NODE_ENV') !== 'production',
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
            BacktestRun,
            BacktestSignalResult,
          ],
          poolSize: 10,
          connectorPackage: 'mysql2' as const,
        };
      },
    }),
    TypeOrmModule.forFeature([
      K,
      Security,
      StrategyVersion,
      StrategyDefinition,
      BacktestRun,
      BacktestSignalResult,
    ]),
  ],
  controllers: [BacktestHealthController, BacktestCommandController],
  providers: [
    BacktestHealthStateService,
    BacktestMarketDataAdapter,
    BacktestRunExecutor,
    BacktestAdmissionService,
    BacktestStartupService,
  ],
})
export class BacktestAppModule {}
