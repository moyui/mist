import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { NotificationAppModule } from './notification-app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(NotificationAppModule);
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 8006);
}
void bootstrap();
