import { Module } from '@nestjs/common';
import { RpcExceptionFilter } from './rpc-exception.filter';

@Module({
  providers: [RpcExceptionFilter],
  exports: [RpcExceptionFilter],
})
export class RpcTransportModule {}
