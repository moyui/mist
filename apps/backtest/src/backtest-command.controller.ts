import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  createRpcRejectionV1,
  createRpcSuccessV1,
  RpcContract,
  type RpcRequestV1,
  type RpcResultV1,
} from '@app/transport/rpc';
import {
  BACKTEST_RUN_SUBMIT_PATTERN,
  decodeSubmitBacktestRunCommandV1,
  type SubmitBacktestRunCommandV1,
  type SubmitBacktestRunErrorCode,
} from '@app/backtest';
import { BacktestAdmissionService } from './backtest-admission.service';

@Controller()
export class BacktestCommandController {
  constructor(private readonly admission: BacktestAdmissionService) {}

  @MessagePattern(BACKTEST_RUN_SUBMIT_PATTERN)
  @RpcContract(decodeSubmitBacktestRunCommandV1)
  async submit(
    @Payload() request: RpcRequestV1<SubmitBacktestRunCommandV1>,
  ): Promise<RpcResultV1<null, SubmitBacktestRunErrorCode>> {
    const result = await this.admission.accept(request.data.runId);
    if (!result.accepted) {
      return createRpcRejectionV1(request.meta.correlationId, result.code);
    }
    return createRpcSuccessV1(request.meta.correlationId, null);
  }
}
