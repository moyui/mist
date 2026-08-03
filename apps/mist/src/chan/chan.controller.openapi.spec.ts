import 'reflect-metadata';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { getSchemaPath } from '@nestjs/swagger';
import { ChanController } from './chan.controller';
import { ChannelTwoPhaseVo, ChannelVo } from './vo/channel.vo';
import { BiTwoPhaseVo, BiVo } from './vo/bi.vo';
import { FenxingVo } from './vo/fenxing.vo';
import { MergedKVo } from './vo/merged-k.vo';
import { KVo } from '../indicator/vo/k.vo';

describe('ChanController OpenAPI contract', () => {
  function responseSchema(
    method: 'postMergeK' | 'postIndexBi' | 'postFenxing' | 'postChannel',
  ) {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      ChanController.prototype[method],
    ) as Record<string, { schema?: unknown }>;

    return responses['200'].schema as {
      allOf: [{ $ref?: string }, { properties: Record<string, unknown> }];
    };
  }

  it('documents Bi and Channel responses as two-phase envelopes', () => {
    expect(responseSchema('postIndexBi').allOf[1]).toEqual({
      properties: {
        success: { type: 'boolean', enum: [true] },
        statusCode: { type: 'integer', enum: [200] },
        data: { $ref: getSchemaPath(BiTwoPhaseVo) },
      },
    });
    expect(responseSchema('postChannel').allOf[1]).toEqual({
      properties: {
        success: { type: 'boolean', enum: [true] },
        statusCode: { type: 'integer', enum: [200] },
        data: { $ref: getSchemaPath(ChannelTwoPhaseVo) },
      },
    });
  });

  it('documents merged K and Fenxing arrays with their response VOs', () => {
    expect(responseSchema('postMergeK').allOf[1].properties.data).toEqual({
      type: 'array',
      items: { $ref: getSchemaPath(MergedKVo) },
    });
    expect(responseSchema('postFenxing').allOf[1].properties.data).toEqual({
      type: 'array',
      items: { $ref: getSchemaPath(FenxingVo) },
    });
  });

  it('documents canonical high/low fields without retired aliases', () => {
    for (const model of [KVo, MergedKVo, FenxingVo, BiVo]) {
      expect(
        Reflect.getMetadata(
          DECORATORS.API_MODEL_PROPERTIES,
          model.prototype,
          'high',
        ),
      ).toBeTruthy();
      expect(
        Reflect.getMetadata(
          DECORATORS.API_MODEL_PROPERTIES,
          model.prototype,
          'low',
        ),
      ).toBeTruthy();
      expect(
        Reflect.getMetadata(
          DECORATORS.API_MODEL_PROPERTIES,
          model.prototype,
          'highest',
        ),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(
          DECORATORS.API_MODEL_PROPERTIES,
          model.prototype,
          'lowest',
        ),
      ).toBeUndefined();
    }
  });

  it('documents the Channel item fields used by generated clients', () => {
    const documented = ['bis', 'zg', 'zd', 'gg', 'dd', 'status'].map(
      (property) =>
        Reflect.getMetadata(
          DECORATORS.API_MODEL_PROPERTIES,
          ChannelVo.prototype,
          property,
        ),
    );

    expect(documented.every(Boolean)).toBe(true);
  });

  it('uses the shared response envelope instead of duplicate response VOs', () => {
    expect(responseSchema('postIndexBi').allOf[0].$ref).toBe(
      '#/components/schemas/ApiResponseDto',
    );
    expect(responseSchema('postChannel').allOf[0].$ref).toBe(
      '#/components/schemas/ApiResponseDto',
    );
  });
});
