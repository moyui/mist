import {
  Controller,
  Get,
  HttpCode,
  INestApplication,
  Module,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiProperty, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiTechnicalErrorResponse,
} from './http-openapi.decorator';

class ResourceVo {
  @ApiProperty()
  id!: string;
}

class RejectionDataVo {
  @ApiProperty()
  reason!: string;
}

@Controller('openapi')
class OpenApiController {
  @Get('business')
  @ApiEnvelopeResponse({
    status: 200,
    type: ResourceVo,
    businessErrors: [{ code: 'NOT_READY', dataType: RejectionDataVo }],
  })
  business(): ResourceVo {
    return { id: 'one' };
  }

  @Get('created')
  @HttpCode(201)
  @ApiEnvelopeResponse({ status: 201, type: ResourceVo })
  created(): ResourceVo {
    return { id: 'two' };
  }

  @Get('invalid')
  @ApiTechnicalErrorResponse({
    status: 400,
    codes: ['VALIDATION_ERROR', 'BAD_REQUEST'],
  })
  invalid(): never {
    throw new Error('not executed');
  }

  @Get('empty')
  @HttpCode(204)
  @ApiEnvelopeResponse({ status: 204 })
  empty(): undefined {
    return undefined;
  }
}

@Module({ controllers: [OpenApiController] })
class OpenApiModule {}

describe('HTTP OpenAPI decorators', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OpenApiModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates oneOf/allOf envelope schemas for each real status', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('contract').setVersion('1').build(),
    );
    const paths = document.paths as Record<string, any>;

    const businessSchema =
      paths['/openapi/business'].get.responses['200'].content[
        'application/json'
      ].schema;
    expect(businessSchema.oneOf).toHaveLength(2);
    expect(businessSchema.oneOf[0].allOf[1].properties.data.$ref).toBe(
      '#/components/schemas/ResourceVo',
    );
    expect(businessSchema.oneOf[1].allOf[1].properties.code.enum).toEqual([
      'NOT_READY',
    ]);
    expect(businessSchema.oneOf[1].allOf[1].properties.data.$ref).toBe(
      '#/components/schemas/RejectionDataVo',
    );

    const createdSchema =
      paths['/openapi/created'].get.responses['201'].content['application/json']
        .schema;
    expect(createdSchema.allOf[1].properties.data.$ref).toBe(
      '#/components/schemas/ResourceVo',
    );

    const badRequestSchema =
      paths['/openapi/invalid'].get.responses['400'].content['application/json']
        .schema;
    expect(badRequestSchema.oneOf).toHaveLength(2);
    expect(
      badRequestSchema.oneOf.map(
        (variant: any) => variant.allOf[1].properties.code.enum[0],
      ),
    ).toEqual(['VALIDATION_ERROR', 'BAD_REQUEST']);

    expect(paths['/openapi/empty'].get.responses['204']).not.toHaveProperty(
      'content',
    );
  });
});
