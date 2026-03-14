import { MCPModule } from '@rekog/mcp-nest';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConfigModule as MistConfigModule } from '@app/config';
import { UtilsModule } from '@app/utils';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndexData, IndexPeriod, IndexDaily } from '@app/shared-data';
import { ChanModule } from '../../mist/src/chan/chan.module';
import { IndicatorModule } from '../../mist/src/indicator/indicator.module';
import { ChanMcpService } from './tools/chan-mcp.service';
import { IndicatorMcpService } from './tools/indicator-mcp.service';
import { DataMcpService } from './tools/data-mcp.service';
import { ScheduleMcpService } from './tools/schedule-mcp.service';
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
    MistConfigModule,
    UtilsModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('MYSQL_SERVER_HOST', 'localhost'),
        port: configService.get('MYSQL_SERVER_PORT', 3306),
        username: configService.get('MYSQL_SERVER_USERNAME', 'root'),
        password: configService.get('MYSQL_SERVER_PASSWORD', ''),
        database: configService.get('MYSQL_SERVER_DATABASE', 'mist'),
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
    MCPModule.forRootAsync({
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
