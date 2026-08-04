import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrorDto,
  ApiTechnicalErrorResponse,
  HttpBusinessRejection,
} from '@app/transport/http';
import {
  ExistingRealtimeSubscriptionDto,
  InitializeRealtimeSubscriptionDto,
  NewRealtimeSubscriptionDto,
} from './dto/initialize-realtime-subscription.dto';
import { RealtimeSubscriptionQueryDto } from './dto/realtime-subscription-query.dto';
import { RealtimeSubscriptionService } from './realtime-subscription.service';
import {
  RealtimeActiveCapacityDataVo,
  RealtimeAssignmentExistsDataVo,
  RealtimeSecurityExistsDataVo,
  RealtimeSecurityNotEligibleDataVo,
  RealtimeSourceConfigNotEligibleDataVo,
  RealtimeSourceConfigNotFoundDataVo,
} from './vo/realtime-subscription-error-data.vo';
import {
  RealtimeSubscriptionPageVo,
  RealtimeSubscriptionVo,
} from './vo/realtime-subscription.vo';

const initializationBusinessErrors = [
  ['REALTIME_ACTIVE_CAPACITY_REACHED', RealtimeActiveCapacityDataVo],
  ['REALTIME_ASSIGNMENT_EXISTS', RealtimeAssignmentExistsDataVo],
  ['REALTIME_SECURITY_EXISTS', RealtimeSecurityExistsDataVo],
  ['REALTIME_SECURITY_NOT_ELIGIBLE', RealtimeSecurityNotEligibleDataVo],
  [
    'REALTIME_SOURCE_CONFIG_NOT_ELIGIBLE',
    RealtimeSourceConfigNotEligibleDataVo,
  ],
  ['REALTIME_SOURCE_CONFIG_NOT_FOUND', RealtimeSourceConfigNotFoundDataVo],
] as const;

@ApiTags('realtime subscriptions v1')
@Controller('v1/realtime-subscriptions')
export class RealtimeSubscriptionController {
  constructor(private readonly service: RealtimeSubscriptionService) {}

  @Get()
  @ApiOperation({ summary: 'List bounded realtime routing assignments' })
  @ApiEnvelopeResponse({
    status: 200,
    description: 'Bounded assignment page and source-global capacity',
    type: RealtimeSubscriptionPageVo,
  })
  @ApiTechnicalErrorResponse({
    status: 400,
    description: 'Invalid cursor or limit',
    codes: ['BAD_REQUEST'],
  })
  async list(
    @Query() query: RealtimeSubscriptionQueryDto,
  ): Promise<RealtimeSubscriptionPageVo> {
    return await this.service.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initialize one immutable realtime assignment' })
  @ApiExtraModels(NewRealtimeSubscriptionDto, ExistingRealtimeSubscriptionDto)
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(NewRealtimeSubscriptionDto) },
        { $ref: getSchemaPath(ExistingRealtimeSubscriptionDto) },
      ],
      discriminator: {
        propertyName: 'mode',
        mapping: {
          new: getSchemaPath(NewRealtimeSubscriptionDto),
          existing: getSchemaPath(ExistingRealtimeSubscriptionDto),
        },
      },
    },
  })
  @ApiEnvelopeResponse({
    status: 201,
    description: 'Realtime assignment initialized',
    type: RealtimeSubscriptionVo,
  })
  @ApiExtraModels(
    ApiErrorDto,
    ...initializationBusinessErrors.map(([, type]) => type),
  )
  @ApiResponse({
    status: 200,
    description: 'Expected realtime assignment business rejection',
    schema: {
      oneOf: initializationBusinessErrors.map(([code, type]) => ({
        allOf: [
          { $ref: getSchemaPath(ApiErrorDto) },
          {
            properties: {
              success: { type: 'boolean', enum: [false] },
              statusCode: { type: 'integer', enum: [200] },
              code: { type: 'string', enum: [code] },
              data: { $ref: getSchemaPath(type) },
            },
          },
        ],
      })),
    },
  })
  @ApiTechnicalErrorResponse({
    status: 400,
    description: 'Invalid initialization shape or provider symbol',
    codes: ['BAD_REQUEST'],
  })
  @ApiTechnicalErrorResponse({
    status: 500,
    description: 'Unknown persistence or internal failure',
    codes: ['INTERNAL_ERROR'],
  })
  async initialize(
    @Body() dto: InitializeRealtimeSubscriptionDto,
  ): Promise<RealtimeSubscriptionVo | HttpBusinessRejection<string, object>> {
    return await this.service.initialize(dto);
  }
}
