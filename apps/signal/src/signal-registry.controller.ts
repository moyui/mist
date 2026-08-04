import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  createRpcSuccessV1,
  RpcContract,
  type RpcRequestV1,
  type RpcResultV1,
} from '@app/transport/rpc';
import {
  decodeRefreshSignalRegistryCommandV1,
  SIGNAL_REGISTRY_REFRESH_PATTERN,
  type RefreshSignalRegistryCommandV1,
  type SignalRegistryRefreshV1,
} from '@app/signal';
import { SignalRegistryService } from './signal-registry.service';

@Controller()
export class SignalRegistryController {
  constructor(private readonly registry: SignalRegistryService) {}

  @MessagePattern(SIGNAL_REGISTRY_REFRESH_PATTERN)
  @RpcContract(decodeRefreshSignalRegistryCommandV1)
  async refresh(
    @Payload() request: RpcRequestV1<RefreshSignalRegistryCommandV1>,
  ): Promise<RpcResultV1<SignalRegistryRefreshV1, never>> {
    const result = await this.registry.refreshDefinition(
      request.data.strategyDefinitionId,
    );
    return createRpcSuccessV1(request.meta.correlationId, result);
  }
}
