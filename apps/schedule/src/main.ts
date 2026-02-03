import { NestFactory } from '@nestjs/core';
import { ScheduleModule } from './schedule.module';

async function bootstrap() {
  const app = await NestFactory.create(ScheduleModule);
  await app.listen(process.env.port ?? 8003);
}
bootstrap();
