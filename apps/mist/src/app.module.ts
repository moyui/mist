import {
  K,
  KExtensionEf,
  KExtensionTdx,
  KExtensionMqmt,
  Security,
  SecuritySourceConfig,
} from '@app/shared-data';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChanModule } from './chan/chan.module';
import { CollectorModule } from './collector/collector.module';
import { DataModule } from './data/data.module';
import { IndicatorModule } from './indicator/indicator.module';
import { KModule } from './k/k.module';
import { SecurityModule } from './security/security.module';
import { TrendModule } from './trend/trend.module';
import { mistEnvSchema } from '@app/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.join(__dirname, '.env'),
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
          entities: [
            K,
            KExtensionEf,
            KExtensionTdx,
            KExtensionMqmt,
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
    DataModule,
    CollectorModule,
    IndicatorModule,
    KModule,
    SecurityModule,
    ChanModule,
    TrendModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
