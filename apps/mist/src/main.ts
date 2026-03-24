import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module';
import { TransformInterceptor } from './interceptors/transform.interceptor';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable global validation with field-level error details
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Remove undefined fields
      forbidNonWhitelisted: true, // Throw error if extra fields present
      transform: false, // Disable transform for now to test basic validation
      validateCustomDecorators: true, // Also validate custom decorators
      exceptionFactory: (errors) => {
        const fieldErrors = errors.reduce(
          (acc, err) => {
            acc[err.property] = Object.values(err.constraints || {});
            return acc;
          },
          {} as Record<string, string[]>,
        );

        return new BadRequestException({
          message: 'VALIDATION_ERROR',
          errors: fieldErrors,
        });
      },
    }),
  );

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

## API Endpoints

- **Health**: \`GET /app/hello\` - Health check
- **Indicators**: \`POST /indicator/*\` - Technical indicators and K-line data (MACD, RSI, KDJ, K-line)
- **Chan Theory**: \`POST /chan/*\` - Chan Theory analysis (Merge K, Bi, Fenxing, Channel)
- **Security**: \`GET|POST|PUT /security/v1/*\` - Security management (v1 versioned)

## Unified Response Format

All HTTP endpoints return responses in a unified format with \`success\`, \`code\`, \`message\`, \`data\`, \`timestamp\`, and \`requestId\` fields.`,
    )
    .setVersion('2.0')
    .addTag('health', 'Health check endpoints')
    .addTag('indicator', 'Technical Indicators - MACD, RSI, KDJ, K-line data')
    .addTag('chan', 'Chan Theory Analysis - Merge K, Bi, Fenxing, Channel')
    .addTag('security v1', 'Security management endpoints (v1)')
    .addServer('http://localhost:8001', 'Local development')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(process.env.PORT ?? 8001);
}
bootstrap();
