import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BACKTEST_RPC_CLIENT } from './backtest-rpc.constants';
import { BacktestRpcClient } from './backtest-rpc.client';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: BACKTEST_RPC_CLIENT,
        inject: [ConfigService],
        useFactory(config: ConfigService) {
          return {
            transport: Transport.TCP,
            options: {
              host: config.get<string>('BACKTEST_RPC_HOST') ?? 'backtest',
              port: config.get<number>('BACKTEST_RPC_PORT') ?? 8005,
            },
          };
        },
      },
    ]),
  ],
  providers: [BacktestRpcClient],
  exports: [BacktestRpcClient],
})
export class BacktestRpcModule {}
