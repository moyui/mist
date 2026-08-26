import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { SignalAppModule } from './signal-app.module';
import { HealthStateService } from './health/health-state.service';
import { registerSignalMetrics } from './observability/metrics';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(SignalAppModule);
  app.useLogger(app.get(Logger));
  registerSignalMetrics(app.get(HealthStateService));
  app.enableShutdownHooks();
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: Number(process.env.SIGNAL_RPC_PORT ?? 9010),
      },
    },
    { inheritAppConfig: false },
  );

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 8010);
}

void bootstrap();
