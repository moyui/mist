import {
  Security,
  K,
  KExtensionEf,
  KExtensionTdx,
  KExtensionQmt,
  SecuritySourceConfig,
  RealtimeSubscriptionAssignment,
} from '@app/shared-data';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { scheduleEnvSchema } from '@app/config';
import { LoggerModule } from 'nestjs-pino';

import { DataCollectionController } from './data-collection.controller';
import { HistoricalCollectorModule } from '../../mist/src/collector/historical-collector.module';
import { TimezoneModule } from '@app/timezone';
import * as path from 'path';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: false, // 不自动打 HTTP 请求日志（避免噪音），保留业务日志
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(
          process.cwd(),
          `.env.${process.env.NODE_ENV || 'development'}`,
        ),
        path.resolve(process.cwd(), '.env'),
      ],
      validationSchema: scheduleEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
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
            Security,
            K,
            KExtensionEf,
            KExtensionTdx,
            KExtensionQmt,
            SecuritySourceConfig,
            RealtimeSubscriptionAssignment,
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
    NestScheduleModule.forRoot(),
    HistoricalCollectorModule,
    TimezoneModule,
  ],
  controllers: [DataCollectionController],
  providers: [],
})
export class ScheduleModule {}
