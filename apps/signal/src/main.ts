import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { SignalAppModule } from './signal-app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(SignalAppModule);
  app.enableShutdownHooks();
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: Number(process.env.SIGNAL_RPC_PORT ?? 9010),
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 8010);
}

void bootstrap();
