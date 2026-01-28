import { NestFactory } from '@nestjs/core';
import { ChanAppModule } from './chan-app.module';

async function bootstrap() {
  const app = await NestFactory.create(ChanAppModule);
  await app.listen(process.env.PORT ?? 3001);
  console.log(`Chan application is running on: ${await app.getUrl()}`);
}
bootstrap();
