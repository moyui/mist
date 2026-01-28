import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
// import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import { ChanModule } from '../../mist/src/chan/chan.module';
import { TrendModule } from '../../mist/src/trend/trend.module';
// import { IndexDaily, IndexData, IndexPeriod } from '@app/shared-data';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.join(__dirname, '.env'),
    }),
    // TypeOrmModule.forRootAsync({
    //   useFactory(configService: ConfigService) {
    //     return {
    //       type: 'mysql',
    //       host: configService.get('mysql_server_host'),
    //       port: configService.get('mysql_server_port'),
    //       username: configService.get('mysql_server_username'),
    //       password: configService.get('mysql_server_password'),
    //       database: configService.get('mysql_server_database'),
    //       synchronize: true,
    //       logging: true,
    //       entities: [IndexData, IndexPeriod, IndexDaily],
    //       poolSize: 10,
    //       connectorPackage: 'mysql2',
    //       extra: {
    //         authPlugins: 'sha256_password',
    //       },
    //     };
    //   },
    //   inject: [ConfigService],
    // }),
    ChanModule,
    TrendModule,
  ],
})
export class ChanAppModule {}
