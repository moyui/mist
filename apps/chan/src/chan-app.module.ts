import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { chanEnvSchema } from '@app/config';
import { LoggerModule } from 'nestjs-pino';
import { pinoTraceMixin } from '@app/otel';

import { ChanModule } from '../../mist/src/chan/chan.module';
import * as path from 'path';
import { HealthController } from './health.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  K,
  KExtensionEf,
  KExtensionQmt,
  KExtensionTdx,
  Security,
  SecuritySourceConfig,
} from '@app/shared-data';
import { HttpTransportModule } from '@app/transport/http';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: false, // 不自动打 HTTP 请求日志（避免噪音），保留业务日志
        mixin: pinoTraceMixin, // 活动 OTel span 的 trace_id/span_id 盖到日志上
        transport: {
          // 官方 pino transport：日志经 worker 线程发 OTLP logs 进 OpenObserve
          // （gaps B1；endpoint 走 OTEL_EXPORTER_OTLP_ENDPOINT，缓冲/重试走 OTEL_BLRP_*）
          target: 'pino-opentelemetry-transport',
        },
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
      validationSchema: chanEnvSchema,
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
            K,
            KExtensionEf,
            KExtensionTdx,
            KExtensionQmt,
            Security,
            SecuritySourceConfig,
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
    ChanModule,
  ],
  controllers: [HealthController],
})
export class ChanAppModule {}
