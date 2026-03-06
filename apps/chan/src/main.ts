import { NestFactory } from '@nestjs/core';
import { ChanAppModule } from './chan-app.module';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(ChanAppModule);

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  await app.listen(process.env.PORT ?? 8008);
  console.log(`Chan application is running on: ${await app.getUrl()}`);
}
bootstrap();
