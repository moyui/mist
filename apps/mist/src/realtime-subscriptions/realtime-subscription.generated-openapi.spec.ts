import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';
import { RealtimeSubscriptionController } from './realtime-subscription.controller';
import { RealtimeSubscriptionService } from './realtime-subscription.service';
import { SecurityV1AliasController } from '../security/security-v1-alias.controller';
import { SecurityService } from '../security/security.service';

describe('generated realtime subscription OpenAPI', () => {
  it('pins exact paths, mode union, nullable state and source enums', async () => {
    const module = await Test.createTestingModule({
      controllers: [RealtimeSubscriptionController, SecurityV1AliasController],
      providers: [
        { provide: RealtimeSubscriptionService, useValue: {} },
        { provide: SecurityService, useValue: {} },
      ],
    }).compile();
    const app = module.createNestApplication();
    try {
      const document = SwaggerModule.createDocument(app, {
        openapi: '3.0.0',
        info: { title: 'test', version: 'test' },
      });
      const json = JSON.stringify(document);

      expect(document.paths).toHaveProperty('/v1/realtime-subscriptions');
      expect(document.paths).toHaveProperty('/v1/securities/{code}/activate');
      expect(document.paths).toHaveProperty('/v1/securities/{code}/deactivate');
      expect(document.paths).toHaveProperty('/v1/securities/{code}/sources');
      expect(document.paths).not.toHaveProperty(
        '/v1/realtime-subscriptions/{id}',
      );

      const post = document.paths['/v1/realtime-subscriptions']?.post;
      const requestBody = post?.requestBody as unknown as {
        content: { 'application/json': { schema: unknown } };
      };
      const requestSchema = requestBody.content['application/json'].schema as {
        oneOf?: Array<{ $ref: string }>;
        discriminator?: { propertyName: string };
      };
      expect(requestSchema.oneOf).toEqual([
        { $ref: '#/components/schemas/NewRealtimeSubscriptionDto' },
        { $ref: '#/components/schemas/ExistingRealtimeSubscriptionDto' },
      ]);
      expect(requestSchema.discriminator?.propertyName).toBe('mode');
      expect(post?.responses).toHaveProperty('201');
      expect(post?.responses).toHaveProperty('200');

      const queryParameters = document.paths['/v1/realtime-subscriptions']?.get
        ?.parameters as unknown as Array<{
        name: string;
        schema: Record<string, unknown>;
      }>;
      expect(queryParameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'afterId',
            schema: expect.objectContaining({ minimum: 1 }),
          }),
          expect.objectContaining({
            name: 'limit',
            schema: expect.objectContaining({
              minimum: 1,
              maximum: 100,
              default: 20,
            }),
          }),
        ]),
      );

      const row = document.components?.schemas?.RealtimeSubscriptionVo as {
        required?: string[];
        properties?: Record<string, Record<string, unknown>>;
      };
      expect(row.required).toEqual(
        expect.arrayContaining([
          'desired',
          'active',
          'activeEvidence',
          'convergence',
          'deferredRemovalReason',
        ]),
      );
      expect(row.properties?.active).toMatchObject({ nullable: true });
      expect(row.properties?.activeEvidence).toMatchObject({ nullable: true });
      expect(json).toContain('tdx_native_list');
      expect(json).toContain('qmt_durable_registry');
      expect(json).not.toContain('mqmt');
      expect(json).not.toContain('unsubscribeSubscriptions');
      expect(json).not.toContain('syncSubscriptions');
    } finally {
      await app.close();
    }
  });
});
