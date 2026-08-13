import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'node:path';
import { LoggerModule } from 'nestjs-pino';
import { notificationEnvSchema } from '@app/config';
import { NOTIFICATION_ENTITIES } from './notification-entities';
import { NotificationDeliveryModule } from './delivery/notification-delivery.module';
import { OoAlertModule } from './oo-alert/oo-alert.module';
import { NotificationAdminController } from './notification-admin.controller';
import { NotificationHealthController } from './notification-health.controller';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: false,
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
      validationSchema: notificationEnvSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
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
          entities: NOTIFICATION_ENTITIES,
          poolSize: 10,
          connectorPackage: 'mysql2' as const,
          extra: { authPlugins: 'sha256_password', connectTimeout: 5_000 },
        };
      },
      inject: [ConfigService],
    }),
    NotificationDeliveryModule,
    OoAlertModule,
  ],
  controllers: [NotificationHealthController, NotificationAdminController],
})
export class NotificationAppModule {}
