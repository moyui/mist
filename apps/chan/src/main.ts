import { NestFactory } from '@nestjs/core';
import { installHttpRequestContext } from '@app/transport/http';
import { Logger } from 'nestjs-pino';
import { ChanAppModule } from './chan-app.module';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(ChanAppModule);
  app.useLogger(app.get(Logger));
  installHttpRequestContext(app);

  // 缠论算法请求体可能较大（merge-k / bi 输入 K 线数组）
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  await app.listen(process.env.PORT ?? 8008);
  console.log(`Chan application is running on: ${await app.getUrl()}`);
}
bootstrap();
