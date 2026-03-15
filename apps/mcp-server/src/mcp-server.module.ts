import { McpModule } from '@rekog/mcp-nest';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UtilsModule } from '@app/utils';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndexData, IndexPeriod, IndexDaily } from '@app/shared-data';
import { ChanModule } from '../../mist/src/chan/chan.module';
import { IndicatorModule } from '../../mist/src/indicator/indicator.module';
import { ChanMcpService } from './services/chan-mcp.service';
import { IndicatorMcpService } from './services/indicator-mcp.service';
import { DataMcpService } from './services/data-mcp.service';
import { ScheduleMcpService } from './services/schedule-mcp.service';
import { mcpEnvSchema } from '@app/config';
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.join(__dirname, '.env'),
      validationSchema: mcpEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    UtilsModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('mysql_server_host', 'localhost'),
        port: configService.get('mysql_server_port', 3306),
        username: configService.get('mysql_server_username', 'root'),
        password: configService.get('mysql_server_password', ''),
        database: configService.get('mysql_server_database', 'mist'),
        synchronize: configService.get('NODE_ENV') !== 'production',
        logging: configService.get('NODE_ENV') !== 'production',
        entities: [IndexData, IndexPeriod, IndexDaily],
        poolSize: 10,
        connectorPackage: 'mysql2',
        extra: {
          authPlugins: 'sha256_password',
        },
      }),
    }),
    TypeOrmModule.forFeature([IndexData, IndexPeriod, IndexDaily]),
    ChanModule,
    IndicatorModule,
    McpModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        name: 'mist-mcp-server',
        version: '1.0.0',
        description:
          'Mist Stock Analysis MCP Server - Provides Chan Theory analysis, technical indicators, and data query tools',
        capabilities: {
          tools: {},
        },
      }),
    }),
  ],
  providers: [
    ChanMcpService,
    IndicatorMcpService,
    DataMcpService,
    ScheduleMcpService,
  ],
  exports: [],
})
export class McpServerModule {}
