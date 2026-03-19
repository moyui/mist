import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

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
      'Stock market analysis and alert system - Technical indicators and Chan Theory analysis',
    )
    .setVersion('1.0')
    .addTag('health', 'Health check endpoints')
    .addTag('chan', 'Chan Theory Analysis - Bi, Fenxing, and Channel detection')
    .addTag('indicator', 'Technical Indicators - MACD, RSI, KDJ, ADX, ATR')
    .addTag('trend', 'Trend Analysis - Market trend detection and analysis')
    .addServer('http://localhost:8001', 'Local development')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(process.env.PORT ?? 8001);
}
bootstrap();
