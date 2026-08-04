import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { BacktestAppModule } from './backtest-app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(BacktestAppModule);
  app.enableShutdownHooks();
  const config = app.get(ConfigService);
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: config.get<number>('BACKTEST_RPC_PORT') ?? 8005,
      },
    },
    { inheritAppConfig: false },
  );
  await app.startAllMicroservices();
  await app.listen(config.get<number>('PORT') ?? 8004);
}

void bootstrap();
