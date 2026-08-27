import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ApiEnvelopeResponse,
  ApiTechnicalErrorResponse,
  HttpBusinessRejection,
  HttpResponseMessage,
} from '@app/transport/http';
import { CreateBacktestRunDto } from '../dto/create-backtest-run.dto';
import { BacktestRunIdParamDto } from '../dto/backtest-run-id-param.dto';
import { BacktestSignalResultQueryDto } from '../dto/backtest-signal-result-query.dto';
import {
  BacktestCommandHttpException,
  BacktestRunCommandService,
} from '../services/backtest-run-command.service';
import { BacktestRunQueryService } from '../services/backtest-run-query.service';
import { BacktestRunReceiptVo } from '../vo/backtest-run-receipt.vo';
import { BacktestRunVo } from '../vo/backtest-run.vo';
import { BacktestSignalResultPageVo } from '../vo/backtest-signal-result-page.vo';

@ApiTags('strategy backtests v1')
@Controller('v1/strategy-backtests')
export class StrategyBacktestController {
  constructor(
    private readonly commandService: BacktestRunCommandService,
    private readonly queryService: BacktestRunQueryService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @HttpResponseMessage('BACKTEST_ACCEPTED')
  @ApiEnvelopeResponse({ status: 202, type: BacktestRunReceiptVo })
  @ApiTechnicalErrorResponse({
    status: 400,
    codes: ['VALIDATION_ERROR', 'NOT_FOUND'],
  })
  @ApiTechnicalErrorResponse({
    status: 409,
    codes: ['BACKTEST_QUANTITY_PROFILE_UNAVAILABLE'],
  })
  @ApiTechnicalErrorResponse({
    status: 429,
    codes: ['BACKTEST_QUEUE_FULL'],
  })
  @ApiTechnicalErrorResponse({
    status: 503,
    codes: ['BACKTEST_NOT_READY', 'BACKTEST_UNAVAILABLE'],
  })
  @ApiTechnicalErrorResponse({
    status: 504,
    codes: ['BACKTEST_COMMAND_TIMEOUT'],
  })
  async createRun(
    @Body() dto: CreateBacktestRunDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.commandService.createRun(dto);
      const runId =
        result instanceof HttpBusinessRejection
          ? result.data?.runId
          : result.runId;
      if (runId)
        response.setHeader('Location', `/v1/strategy-backtests/${runId}`);
      return result;
    } catch (error) {
      if (error instanceof BacktestCommandHttpException) {
        response.setHeader('Location', `/v1/strategy-backtests/${error.runId}`);
      }
      throw error;
    }
  }

  @Get()
  @ApiEnvelopeResponse({ status: 200, type: BacktestRunVo, isArray: true })
  async listRuns(@Query('strategyDefinitionId') strategyDefinitionId?: string) {
    const defId = strategyDefinitionId
      ? parseInt(strategyDefinitionId, 10)
      : undefined;
    return await this.queryService.listRuns(
      Number.isFinite(defId) && defId! > 0 ? defId : undefined,
    );
  }

  @Get(':runId')
  @ApiEnvelopeResponse({ status: 200, type: BacktestRunVo })
  async findRun(@Param() params: BacktestRunIdParamDto) {
    return await this.queryService.findRun(params.runId);
  }

  @Get(':runId/signals')
  @ApiEnvelopeResponse({
    status: 200,
    type: BacktestSignalResultPageVo,
    businessErrors: [
      { code: 'BACKTEST_RUN_NOT_FOUND' },
      { code: 'BACKTEST_RESULTS_NOT_READY' },
      { code: 'BACKTEST_RESULTS_UNAVAILABLE' },
    ],
  })
  async listSignals(
    @Param() params: BacktestRunIdParamDto,
    @Query() query: BacktestSignalResultQueryDto,
  ) {
    return await this.queryService.listSignals(params.runId, query);
  }
}
