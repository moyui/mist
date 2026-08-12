import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { installHttpRequestContext } from '@app/transport/http';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(Logger));
  const productizationMode =
    app.get(ConfigService).get<string>('REALTIME_PRODUCTIZATION_MODE') ?? 'off';
  app.get(Logger).log(`realtime productization mode=${productizationMode}`);
  installHttpRequestContext(app);

  // Swagger API Documentation configuration
  const config = new DocumentBuilder()
    .setTitle('Mist API')
    .setDescription(
      `Stock market analysis and alert system - Technical indicators and Chan Theory analysis

## Multi-Data Source Support

This API supports multiple data sources for K-line data:

- **ef** - East Money (default)
- **tdx** - TongDaXin
- **qmt** - 大 QMT

Most endpoints accept an optional \`source\` parameter to specify which data source to use.
If not provided, the default source for the application will be used.

## API Endpoints

- **Health**: \`GET /app/hello\` - Health check
- **Indicators**: \`POST /v1/indicators/*\` - Technical indicators and K-line data (MACD, RSI, KDJ, K-line)
- **Chan Theory**: \`POST /v1/chan/*\` - Chan Theory analysis (Merge K, Bi, Fenxing, Channel)
- **Security**: \`GET|POST|PUT|DELETE /v1/securities*\` and \`/v1/security-sources\` - Security management

## Unified Response Format

All HTTP endpoints return responses in a unified format with \`success\`, \`statusCode\`, \`message\`, \`data\`, \`timestamp\`, and \`requestId\` fields.`,
    )
    .setVersion('2.0')
    .addTag('health', 'Health check endpoints')
    .addTag('indicator', 'Technical Indicators - MACD, RSI, KDJ, K-line data')
    .addTag('chan', 'Chan Theory Analysis - Merge K, Bi, Fenxing, Channel')
    .addTag('security v1', 'Security management endpoints (v1)')
    .addTag(
      'realtime subscriptions v1',
      'Immutable realtime routing assignments and convergence inventory',
    )
    .addServer('http://localhost:8001', 'Local development')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(process.env.PORT ?? 8001);
}
bootstrap();
