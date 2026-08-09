import { NestFactory } from '@nestjs/core';
import { ScheduleModule } from './schedule.module';
import { initTelemetry } from '@app/otel';

async function bootstrap() {
  initTelemetry({ serviceName: 'schedule' });
  const app = await NestFactory.create(ScheduleModule);
  await app.listen(process.env.PORT ?? 8003);
}
bootstrap();
