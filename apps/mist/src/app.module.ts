import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DataModule } from './data/data.module';
import { IndexDaily } from './data/entities/index-daily.entity';
import { IndexData } from './data/entities/index-data.entitiy';
import { IndexPeriod } from './data/entities/index-period.entity';
import { IndicatorModule } from './indicator/indicator.module';
import { TaskModule } from './task/task.module';
import { TimezoneModule } from './timezone/timezone.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.join(__dirname, '.env'),
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory(configService: ConfigService) {
        return {
          type: 'mysql',
          host: configService.get('mysql_server_host'),
          port: configService.get('mysql_server_port'),
          username: configService.get('mysql_server_username'),
          password: configService.get('mysql_server_password'),
          database: configService.get('mysql_server_database'),
          synchronize: true,
          logging: true,
          entities: [IndexData, IndexPeriod, IndexDaily],
          poolSize: 10,
          connectorPackage: 'mysql2',
          extra: {
            authPlugins: 'sha256_password',
          },
        };
      },
      inject: [ConfigService],
    }),
    DataModule,
    TaskModule,
    TimezoneModule,
    IndicatorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
