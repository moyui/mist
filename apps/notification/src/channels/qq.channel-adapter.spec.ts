import { ConfigService } from '@nestjs/config';
import { QqChannelAdapter } from './qq.channel-adapter';

function configStub(values: Record<string, unknown>): ConfigService {
  return { get: jest.fn((k: string) => values[k]) } as unknown as ConfigService;
}

function jsonResponse(body: unknown): Response {
  return { json: async () => body } as Response;
}

describe('QqChannelAdapter', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('permanent_failure when unconfigured', async () => {
    const adapter = new QqChannelAdapter(configStub({}));
    const res = await adapter.send({ message: { summary: 'x' } } as any);
    expect(res.status).toBe('permanent_failure');
  });

  it('sent with providerMessageId on OneBot status=ok', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ status: 'ok', retcode: 0, data: { message_id: 42 } }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;
    const adapter = new QqChannelAdapter(
      configStub({
        NOTIFICATION_QQ_BASE_URL: 'https://napcat.example',
        NOTIFICATION_QQ_TARGET: '123456',
        NOTIFICATION_QQ_ACCESS_TOKEN: 'sekret',
      }),
    );
    const res = await adapter.send({ message: { summary: 'hi' } } as any);
    expect(res.status).toBe('sent');
    expect(res.providerMessageId).toBe('42');
    // token passed as access_token query param (not header), base URL de-slashed
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('access_token=sekret');
    expect(url).not.toMatch(/\/\/$/);
  });

  it('transient_failure on OneBot failed status', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ status: 'failed', retcode: 100, msg: 'offline' }),
      ) as unknown as typeof fetch;
    const adapter = new QqChannelAdapter(
      configStub({
        NOTIFICATION_QQ_BASE_URL: 'https://napcat.example',
        NOTIFICATION_QQ_TARGET: '123456',
      }),
    );
    const res = await adapter.send({ message: { summary: 'hi' } } as any);
    expect(res.status).toBe('transient_failure');
  });

  it('transient_failure when fetch throws', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('econnreset')) as unknown as typeof fetch;
    const adapter = new QqChannelAdapter(
      configStub({
        NOTIFICATION_QQ_BASE_URL: 'https://napcat.example',
        NOTIFICATION_QQ_TARGET: '123456',
      }),
    );
    const res = await adapter.send({ message: { summary: 'hi' } } as any);
    expect(res.status).toBe('transient_failure');
    expect(res.error).toContain('econnreset');
  });
});
