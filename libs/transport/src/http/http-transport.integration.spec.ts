import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  INestApplication,
  Logger,
  Module,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';
import request from 'supertest';
import { QueryFailedError } from 'typeorm';
import { HttpBusinessRejection } from './http-business-rejection';
import { installHttpRequestContext } from './http-request-context.middleware';
import { HttpResponseMessage } from './http-response-message.decorator';
import { HttpTransportModule } from './http-transport.module';

class ChildDto {
  @IsString()
  name!: string;
}

class ParentDto {
  @IsString()
  label!: string;

  @ValidateNested({ each: true })
  @Type(() => ChildDto)
  children!: ChildDto[];
}

@Controller('contract')
class ContractController {
  @Get('success')
  success(): { message: string } {
    return { message: 'domain message' };
  }

  @Post('created')
  @HttpCode(201)
  @HttpResponseMessage('RESOURCE_CREATED')
  created(): { id: string } {
    return { id: 'created-1' };
  }

  @Get('undefined')
  undefinedResult(): undefined {
    return undefined;
  }

  @Get('empty')
  @HttpCode(204)
  empty(): undefined {
    return undefined;
  }

  @Get('business')
  business(): HttpBusinessRejection<'NOT_READY', { retryable: false }> {
    return new HttpBusinessRejection('NOT_READY', 'Not ready', {
      retryable: false,
    });
  }

  @Get('business-shape')
  businessShape(): object {
    return { success: false, code: 'NOT_A_MARKER', message: 'domain data' };
  }

  @Get('invalid-business-code')
  invalidBusinessCode(): HttpBusinessRejection<string> {
    return new HttpBusinessRejection('lowercase', 'unsafe');
  }

  @Post('validate')
  validate(@Body() dto: ParentDto): ParentDto {
    return dto;
  }

  @Get('bad-request')
  badRequest(): never {
    throw new BadRequestException('Plain bad request');
  }

  @Get('structured-4xx')
  structured4xx(): never {
    throw new HttpException(
      {
        code: 'RESOURCE_CONFLICT',
        message: 'Safe conflict',
        data: { id: 'resource-1' },
        error: 'must not leak',
      },
      409,
    );
  }

  @Get('invalid-structured-4xx')
  invalidStructured4xx(): never {
    throw new HttpException(
      { code: 409, message: 'Safe bad request', data: { ignored: true } },
      409,
    );
  }

  @Get('structured-5xx')
  structured5xx(): never {
    throw new HttpException(
      {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Dependency unavailable',
        data: { dependency: 'quotes' },
        stack: 'must not leak',
      },
      503,
    );
  }

  @Get('plain-502')
  plain502(): never {
    throw new HttpException('provider raw failure', 502);
  }

  @Get('deadline')
  deadline(): never {
    throw new HttpException(
      { code: 'UPSTREAM_TIMEOUT', message: 'Upstream deadline exceeded' },
      504,
    );
  }

  @Get('invalid-structured-5xx')
  invalidStructured5xx(): never {
    throw new HttpException(
      {
        code: 'invalid-code',
        message: 'driver exploded',
        data: { sql: 'select secret' },
      },
      503,
    );
  }

  @Get('invalid-status')
  invalidStatus(): never {
    throw new HttpException({ code: 'FAKE_SUCCESS', message: 'unsafe' }, 200);
  }

  @Get('unknown')
  unknown(): never {
    throw new Error('SQL secret constraint stack');
  }

  @Get('query-failed')
  queryFailed(): never {
    throw new QueryFailedError(
      'SELECT secret',
      ['token'],
      new Error('driver constraint secret'),
    );
  }

  @Get('cause')
  cause(): never {
    const exception = new Error('outer failure') as Error & { cause?: unknown };
    exception.cause = new Error('inner cause');
    throw exception;
  }

  @Get('primitive')
  primitive(): never {
    throw 'unsafe primitive';
  }
}

@Module({
  imports: [HttpTransportModule],
  controllers: [ContractController],
})
class ContractModule {}

describe('HttpTransportModule integration', () => {
  let app: INestApplication;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeAll(async () => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const moduleRef = await Test.createTestingModule({
      imports: [ContractModule],
    }).compile();
    app = moduleRef.createNestApplication();
    installHttpRequestContext(app);
    installHttpRequestContext(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('mirrors actual success status and keeps domain message inside data', async () => {
    const response = await request(app.getHttpServer())
      .get('/contract/success?secret=query')
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      statusCode: 200,
      message: 'SUCCESS',
      data: { message: 'domain message' },
      path: '/contract/success',
    });
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
    expect(response.body.requestId).toMatch(/^http-[0-9a-f-]{36}$/);
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
  });

  it('supports explicit messages, 201, undefined data, and 204', async () => {
    const created = await request(app.getHttpServer())
      .post('/contract/created')
      .expect(201);
    expect(created.body).toMatchObject({
      success: true,
      statusCode: 201,
      message: 'RESOURCE_CREATED',
      data: { id: 'created-1' },
    });

    const undefinedResult = await request(app.getHttpServer())
      .get('/contract/undefined')
      .expect(200);
    expect(undefinedResult.body.data).toBeNull();

    const noContent = await request(app.getHttpServer())
      .get('/contract/empty')
      .expect(204);
    expect(noContent.text).toBe('');
    expect(noContent.headers['x-request-id']).toMatch(/^http-[0-9a-f-]{36}$/);
  });

  it('maps only explicit business marker instances to HTTP-200 rejection', async () => {
    errorSpy.mockClear();
    warnSpy.mockClear();
    const rejection = await request(app.getHttpServer())
      .get('/contract/business')
      .expect(200);
    expect(rejection.body).toMatchObject({
      success: false,
      statusCode: 200,
      code: 'NOT_READY',
      message: 'Not ready',
      data: { retryable: false },
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    const shapedObject = await request(app.getHttpServer())
      .get('/contract/business-shape')
      .expect(200);
    expect(shapedObject.body).toMatchObject({
      success: true,
      data: { success: false, code: 'NOT_A_MARKER' },
    });

    const invalidMarker = await request(app.getHttpServer())
      .get('/contract/invalid-business-code')
      .expect(500);
    expect(invalidMarker.body).toMatchObject({
      success: false,
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
    });
  });

  it('recursively flattens validation errors without exposing raw values', async () => {
    const response = await request(app.getHttpServer())
      .post('/contract/validate')
      .send({ label: 12, extra: true, children: [{ name: 42 }] })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
    });
    expect(response.body.errors).toEqual({
      'children.0.name': ['name must be a string'],
      extra: ['property extra should not exist'],
      label: ['label must be a string'],
    });
    expect(JSON.stringify(response.body.errors)).not.toContain('42');
  });

  it('separates ordinary bad requests from DTO validation', async () => {
    warnSpy.mockClear();
    const plain = await request(app.getHttpServer())
      .get('/contract/bad-request')
      .expect(400);
    expect(plain.body).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Plain bad request',
    });
    expect(plain.body).not.toHaveProperty('errors');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]).toHaveLength(1);

    warnSpy.mockClear();
    const malformed = await request(app.getHttpServer())
      .post('/contract/validate')
      .set('Content-Type', 'application/json')
      .set('X-Request-Id', 'client-controlled')
      .send('{"broken":')
      .expect(400);
    expect(malformed.body.code).toBe('BAD_REQUEST');
    expect(malformed.body).not.toHaveProperty('errors');
    expect(malformed.body.requestId).toMatch(/^http-[0-9a-f-]{36}$/);
    expect(malformed.body.requestId).not.toBe('client-controlled');
    expect(malformed.headers['x-request-id']).toBe(malformed.body.requestId);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]).toHaveLength(1);
  });

  it('allowlists structured errors and fails closed for unknown 5xx data', async () => {
    const conflict = await request(app.getHttpServer())
      .get('/contract/structured-4xx')
      .expect(409);
    expect(conflict.body).toMatchObject({
      code: 'RESOURCE_CONFLICT',
      message: 'Safe conflict',
      data: { id: 'resource-1' },
    });
    expect(conflict.body).not.toHaveProperty('error');

    const fallbackConflict = await request(app.getHttpServer())
      .get('/contract/invalid-structured-4xx')
      .expect(409);
    expect(fallbackConflict.body).toMatchObject({
      code: 'CONFLICT',
      message: 'Safe bad request',
    });
    expect(fallbackConflict.body).not.toHaveProperty('data');

    const approved = await request(app.getHttpServer())
      .get('/contract/structured-5xx')
      .expect(503);
    expect(approved.body).toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'Dependency unavailable',
      data: { dependency: 'quotes' },
    });
    expect(approved.body).not.toHaveProperty('stack');

    const invalid = await request(app.getHttpServer())
      .get('/contract/invalid-structured-5xx')
      .expect(503);
    expect(invalid.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service Unavailable',
    });
    expect(invalid.body).not.toHaveProperty('data');
    expect(JSON.stringify(invalid.body)).not.toMatch(/driver|sql|secret/i);

    const badGateway = await request(app.getHttpServer())
      .get('/contract/plain-502')
      .expect(502);
    expect(badGateway.body).toMatchObject({
      code: 'BAD_GATEWAY',
      message: 'Bad Gateway',
    });
    expect(JSON.stringify(badGateway.body)).not.toContain('provider raw');

    const deadline = await request(app.getHttpServer())
      .get('/contract/deadline')
      .expect(504);
    expect(deadline.body).toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      message: 'Upstream deadline exceeded',
    });
  });

  it('normalizes invalid-status, unknown, and primitive throws to safe 500', async () => {
    for (const path of [
      'invalid-status',
      'unknown',
      'query-failed',
      'primitive',
    ]) {
      errorSpy.mockClear();
      const response = await request(app.getHttpServer())
        .get(`/contract/${path}`)
        .expect(500);
      expect(response.body).toMatchObject({
        success: false,
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Internal Server Error',
      });
      expect(response.body).not.toHaveProperty('data');
      expect(response.body).not.toHaveProperty('errors');
      expect(response.body.message).not.toMatch(/sql|constraint|primitive/i);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toContain(response.body.requestId);
    }
  });

  it('retains an exception cause in the authoritative 5xx boundary log', async () => {
    errorSpy.mockClear();
    const response = await request(app.getHttpServer())
      .get('/contract/cause')
      .expect(500);

    expect(response.body.code).toBe('INTERNAL_ERROR');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][1]).toContain('outer failure');
    expect(errorSpy.mock.calls[0][1]).toContain('inner cause');
  });
});
