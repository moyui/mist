import { NestFactory } from '@nestjs/core';
import { SayaModule } from './saya.module';

async function bootstrap() {
  const app = await NestFactory.create(SayaModule);
  await app.listen(process.env.port ?? 3001);
}
bootstrap();
