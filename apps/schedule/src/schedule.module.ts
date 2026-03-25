import { Security, K, SecuritySourceConfig } from '@app/shared-data';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RunModule } from './run/run.module';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { TaskModule } from './task/task.module';
import { scheduleEnvSchema } from '@app/config';
import { UtilsModule } from '@app/utils';
import { DataCollectionScheduleController } from './schedulers/schedule.controller';
import { CollectorModule } from '../../mist/src/collector/collector.module';
import { SecurityModule } from '../../mist/src/security/security.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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
          synchronize: configService.get('NODE_ENV') !== 'production',
          logging: configService.get('NODE_ENV') !== 'production',
          entities: [Security, K, SecuritySourceConfig],
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
    UtilsModule,
    CollectorModule,
    SecurityModule,
    RunModule,
    TaskModule,
  ],
  controllers: [ScheduleController, DataCollectionScheduleController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
