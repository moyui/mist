import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorDto } from './api-error.dto';
import { ApiResponseDto } from './api-response.dto';
import { isPublicHttpCode } from './http-code';

type PrimitiveSchemaType =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor;
type SchemaType = Type<unknown> | PrimitiveSchemaType;

export interface ApiBusinessErrorVariant {
  code: string;
  dataType?: SchemaType;
}

export interface ApiEnvelopeResponseOptions {
  status: number;
  description?: string;
  type?: SchemaType;
  isArray?: boolean;
  businessErrors?: readonly ApiBusinessErrorVariant[];
}

export interface ApiTechnicalErrorResponseOptions {
  status: number;
  description?: string;
  codes: readonly string[];
  dataType?: SchemaType;
}

export function ApiEnvelopeResponse(
  options: ApiEnvelopeResponseOptions,
): MethodDecorator & ClassDecorator {
  assertHttpStatus(options.status);
  if (options.businessErrors?.length && options.status !== 200) {
    throw new Error('HTTP business rejection variants require status 200');
  }
  for (const variant of options.businessErrors ?? []) {
    assertPublicCode(variant.code);
  }
  if (options.status === 204) {
    return ApiResponse({
      status: options.status,
      description: options.description,
    });
  }

  const models = compactModels([
    ApiResponseDto,
    ApiErrorDto,
    options.type,
    ...(options.businessErrors ?? []).map((variant) => variant.dataType),
  ]);
  const success = successEnvelopeSchema(
    options.status,
    options.type,
    options.isArray,
  );
  const variants = [
    success,
    ...(options.businessErrors ?? []).map(businessErrorEnvelopeSchema),
  ];

  return applyDecorators(
    ApiExtraModels(...models),
    ApiResponse({
      status: options.status,
      description: options.description,
      schema: variants.length === 1 ? variants[0] : { oneOf: variants },
    }),
  );
}

export function ApiTechnicalErrorResponse(
  options: ApiTechnicalErrorResponseOptions,
): MethodDecorator & ClassDecorator {
  if (options.status < 400 || options.status > 599) {
    throw new Error('Technical error response requires a 4xx or 5xx status');
  }
  if (options.codes.length === 0) {
    throw new Error('Technical error response requires at least one code');
  }
  for (const code of options.codes) assertPublicCode(code);
  const models = compactModels([ApiErrorDto, options.dataType]);
  const variants = options.codes.map((code) =>
    technicalErrorEnvelopeSchema(options.status, code, options.dataType),
  );

  return applyDecorators(
    ApiExtraModels(...models),
    ApiResponse({
      status: options.status,
      description: options.description,
      schema: variants.length === 1 ? variants[0] : { oneOf: variants },
    }),
  );
}

function successEnvelopeSchema(
  status: number,
  type?: SchemaType,
  isArray = false,
): object {
  return {
    allOf: [
      { $ref: getSchemaPath(ApiResponseDto) },
      {
        properties: {
          success: { type: 'boolean', enum: [true] },
          statusCode: { type: 'integer', enum: [status] },
          data: dataSchema(type, isArray),
        },
      },
    ],
  };
}

function businessErrorEnvelopeSchema(variant: ApiBusinessErrorVariant): object {
  return {
    allOf: [
      { $ref: getSchemaPath(ApiErrorDto) },
      {
        properties: {
          success: { type: 'boolean', enum: [false] },
          statusCode: { type: 'integer', enum: [200] },
          code: { type: 'string', enum: [variant.code] },
          ...(variant.dataType ? { data: dataSchema(variant.dataType) } : {}),
        },
      },
    ],
  };
}

function technicalErrorEnvelopeSchema(
  status: number,
  code: string,
  dataType?: SchemaType,
): object {
  return {
    allOf: [
      { $ref: getSchemaPath(ApiErrorDto) },
      {
        properties: {
          success: { type: 'boolean', enum: [false] },
          statusCode: { type: 'integer', enum: [status] },
          code: { type: 'string', enum: [code] },
          ...(dataType ? { data: dataSchema(dataType) } : {}),
        },
      },
    ],
  };
}

function dataSchema(type?: SchemaType, isArray = false): object {
  if (!type) return { nullable: true };
  const schema = primitiveSchema(type) ?? { $ref: getSchemaPath(type) };
  return isArray ? { type: 'array', items: schema } : schema;
}

function compactModels(
  models: ReadonlyArray<SchemaType | undefined>,
): Type<unknown>[] {
  return [
    ...new Set(
      models.filter(
        (model): model is Type<unknown> =>
          !!model && primitiveSchema(model) === undefined,
      ),
    ),
  ];
}

function primitiveSchema(type: SchemaType): object | undefined {
  if (type === String) return { type: 'string' };
  if (type === Number) return { type: 'number' };
  if (type === Boolean) return { type: 'boolean' };
  return undefined;
}

function assertHttpStatus(status: number): void {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new Error('Invalid HTTP response status');
  }
}

function assertPublicCode(code: string): void {
  if (!isPublicHttpCode(code)) throw new Error('Invalid public HTTP code');
}
