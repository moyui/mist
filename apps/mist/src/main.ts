import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { installHttpRequestContext } from '@app/transport/http';
import { Logger } from 'nestjs-pino';
import { registerCandleMetrics } from './realtime/observability/candle-metrics';
import { registerSubscriptionLifecycleMetrics } from './realtime/observability/subscription-lifecycle-metrics';
import { registerStartupCompensationMetrics } from './realtime/observability/startup-compensation-metrics';
import { CandleFinalizer } from './realtime/candle/candle-finalizer';
import { RealtimeMarketDataProductService } from './realtime/candle/realtime-market-data-product.service';
import { RealtimeSecurityAllowlistService } from './realtime/realtime-security-allowlist.service';
import { RealtimeSubscriptionLifecycleObservationStore } from './realtime-subscriptions/realtime-subscription-lifecycle-observation.store';
import { RuntimeConfigService } from './realtime-subscriptions/runtime-config.service';
import { RealtimeStrategyStartupCompensationService } from './realtime/strategy-trigger/realtime-strategy-startup-compensation.service';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(Logger));
  registerCandleMetrics(
    app.get(CandleFinalizer),
    app.get(RealtimeMarketDataProductService),
  );
  registerStartupCompensationMetrics(
    app.get(RealtimeStrategyStartupCompensationService),
  );
  const runtimeConfig = app.get(RuntimeConfigService);
  registerSubscriptionLifecycleMetrics(
    app.get(RealtimeSubscriptionLifecycleObservationStore),
    app.get(RealtimeSecurityAllowlistService),
    () => runtimeConfig.getAutoReconcileCached(),
  );
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
