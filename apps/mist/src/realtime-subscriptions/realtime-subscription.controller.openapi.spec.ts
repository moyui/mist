import 'reflect-metadata';
import { getSchemaPath } from '@nestjs/swagger';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import {
  ExistingRealtimeSubscriptionDto,
  NewRealtimeSubscriptionDto,
} from './dto/initialize-realtime-subscription.dto';
import { RealtimeSubscriptionController } from './realtime-subscription.controller';
import {
  RealtimeSubscriptionPageVo,
  RealtimeSubscriptionVo,
} from './vo/realtime-subscription.vo';

describe('RealtimeSubscriptionController OpenAPI contract', () => {
  it('documents bounded page VO through the shared envelope', () => {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      RealtimeSubscriptionController.prototype.list,
    ) as Record<string, { schema: { allOf: object[] } }>;
    expect(responses['200'].schema.allOf[1]).toEqual({
      properties: {
        success: { type: 'boolean', enum: [true] },
        statusCode: { type: 'integer', enum: [200] },
        data: { $ref: getSchemaPath(RealtimeSubscriptionPageVo) },
      },
    });
  });

  it('documents POST success at 201 and exact mode union', () => {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      RealtimeSubscriptionController.prototype.initialize,
    ) as Record<string, { schema: unknown }>;
    expect(responses['201'].schema).toEqual({
      allOf: [
        { $ref: '#/components/schemas/ApiResponseDto' },
        {
          properties: {
            success: { type: 'boolean', enum: [true] },
            statusCode: { type: 'integer', enum: [201] },
            data: { $ref: getSchemaPath(RealtimeSubscriptionVo) },
          },
        },
      ],
    });

    const body = Reflect.getMetadata(
      DECORATORS.API_PARAMETERS,
      RealtimeSubscriptionController.prototype.initialize,
    ) as Array<{ in: string; schema?: unknown }>;
    expect(body.find((parameter) => parameter.in === 'body')?.schema).toEqual({
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
    });
  });

  it('associates each HTTP-200 business code with one typed data schema', () => {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      RealtimeSubscriptionController.prototype.initialize,
    ) as Record<
      string,
      { schema: { oneOf: Array<{ allOf: Array<{ properties?: object }> }> } }
    >;
    const variants = responses['200'].schema.oneOf;
    expect(variants).toHaveLength(6);
    const codes = variants.map(
      (variant) =>
        (
          variant.allOf[1].properties as {
            code: { enum: string[] };
            data: { $ref: string };
          }
        ).code.enum[0],
    );
    expect(codes).toEqual([
      'REALTIME_ACTIVE_CAPACITY_REACHED',
      'REALTIME_ASSIGNMENT_EXISTS',
      'REALTIME_SECURITY_EXISTS',
      'REALTIME_SECURITY_NOT_ELIGIBLE',
      'REALTIME_SOURCE_CONFIG_NOT_ELIGIBLE',
      'REALTIME_SOURCE_CONFIG_NOT_FOUND',
    ]);
    for (const variant of variants) {
      expect(
        (variant.allOf[1].properties as { data: { $ref?: string } }).data.$ref,
      ).toMatch(/^#\/components\/schemas\//);
    }
  });
});
