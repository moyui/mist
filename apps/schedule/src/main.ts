import { NestFactory } from '@nestjs/core';
import { ScheduleModule } from './schedule.module';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(ScheduleModule);
  app.useLogger(app.get(Logger));
  await app.listen(process.env.PORT ?? 8003);
}
bootstrap();
