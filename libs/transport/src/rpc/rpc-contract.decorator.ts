import { applyDecorators, UseFilters, UsePipes } from '@nestjs/common';
import { RpcDomainDecoder } from './rpc-decoder';
import { RpcExceptionFilter } from './rpc-exception.filter';
import { RpcValidationPipe } from './rpc-validation.pipe';

export function RpcContract<TData>(
  domainDecoder: RpcDomainDecoder<TData>,
): MethodDecorator {
  return applyDecorators(
    UsePipes(new RpcValidationPipe(domainDecoder)),
    UseFilters(RpcExceptionFilter),
  );
}
