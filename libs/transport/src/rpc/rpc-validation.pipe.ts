import { Injectable, PipeTransform } from '@nestjs/common';
import { decodeRpcRequestV1, RpcDomainDecoder } from './rpc-decoder';
import { RpcInvalidRequestException, RpcRequestV1 } from './rpc-envelope';

@Injectable()
export class RpcValidationPipe<TData = unknown>
  implements PipeTransform<unknown, RpcRequestV1<TData>>
{
  constructor(private readonly domainDecoder: RpcDomainDecoder<TData>) {}

  transform(value: unknown): RpcRequestV1<TData> {
    try {
      return decodeRpcRequestV1(value, this.domainDecoder);
    } catch (error) {
      throw new RpcInvalidRequestException(error);
    }
  }
}
