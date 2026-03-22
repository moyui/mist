import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './interceptors/transform.interceptor';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 全局响应拦截器
  app.useGlobalInterceptors(new TransformInterceptor());

  // 全局异常过滤器
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger API Documentation configuration
  const config = new DocumentBuilder()
    .setTitle('Mist API')
    .setDescription(
      `Stock market analysis and alert system - Technical indicators and Chan Theory analysis

## Multi-Data Source Support

This API supports multiple data sources for K-line data:

- **ef** - East Money (default)
- **tdx** - TongDaXin
- **mqmt** - MaQiMaTe

Most endpoints accept an optional \`source\` parameter to specify which data source to use.
If not provided, the default source for the application will be used.

## Version 2.0 Features

- Unified query DTOs with source selection
- Separate v1 endpoints for security and collector operations
- Enhanced Chan Theory analysis with multi-source support
- Improved error handling and validation`,
    )
    .setVersion('2.0')
    .addTag('health', 'Health check endpoints')
    .addTag('indicator', 'Technical Indicators - MACD, RSI, KDJ, ADX, ATR')
    .addTag('k', 'K-line data retrieval with multi-source support')
    .addTag('chan', 'Chan Theory Analysis - Bi, Fenxing, and Channel detection')
    .addTag('security v1', 'Security management endpoints (v1)')
    .addTag('collector v1', 'Data collection management endpoints (v1)')
    .addServer('http://localhost:8001', 'Local development')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(process.env.PORT ?? 8001);
}
bootstrap();
