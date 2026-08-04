import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SIGNAL_REGISTRY_RPC_CLIENT } from './signal-registry-rpc.constants';
import { SignalRegistryRpcClient } from './signal-registry-rpc.client';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: SIGNAL_REGISTRY_RPC_CLIENT,
        inject: [ConfigService],
        useFactory(config: ConfigService) {
          return {
            transport: Transport.TCP,
            options: {
              host: config.get<string>('SIGNAL_RPC_HOST') ?? 'signal',
              port: config.get<number>('SIGNAL_RPC_PORT') ?? 9010,
            },
          };
        },
      },
    ]),
  ],
  providers: [SignalRegistryRpcClient],
  exports: [SignalRegistryRpcClient],
})
export class SignalRegistryRpcModule {}
